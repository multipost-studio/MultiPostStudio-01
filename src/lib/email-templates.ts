/**
 * Editable lifecycle emails: the account-verification, password-reset and team-invitation messages. Staff can publish a
 * new version of each from /admin/emails; the newest published version is used until someone resets it to the built-in text.
 *
 * Plain text only. The body is escaped when it is turned into HTML, so a template can never inject markup, and the subject
 * cannot contain a line break (that would let a header be injected into the message). Only the placeholders listed for a
 * template are replaced; anything else in braces is rejected when the version is saved, so a typo cannot reach a customer.
 * Pure: shared by the senders, the admin page and the tests.
 */
export type TemplateKey = "verify" | "reset" | "invite_new" | "invite_existing";

export type TemplateDef = {
  key: TemplateKey;
  label: string;
  /** When it is sent. */
  when: string;
  /** Placeholders that may be used, and which must appear. */
  placeholders: readonly { name: string; hint: string; required?: boolean }[];
  defaultSubject: string;
  defaultBody: string;
};

export const TEMPLATES: readonly TemplateDef[] = [
  {
    key: "verify",
    label: "Verify your email",
    when: "Sent when someone signs up or asks for a new verification link.",
    placeholders: [{ name: "name", hint: "the person's first name, or “there”" }, { name: "link", hint: "the verification link", required: true }],
    defaultSubject: "Verify your email",
    defaultBody: "Hi {name}, confirm your email address to finish setting up your account:\n{link}",
  },
  {
    key: "reset",
    label: "Reset your password",
    when: "Sent when someone asks to reset their password.",
    placeholders: [{ name: "name", hint: "the person's first name, or “there”" }, { name: "link", hint: "the reset link", required: true }],
    defaultSubject: "Reset your password",
    defaultBody: "Hi {name}, use this link to set a new password (valid for one hour):\n{link}",
  },
  {
    key: "invite_new",
    label: "Team invitation (new account)",
    when: "Sent when someone is added to a team and has no account yet, so they need to choose a password.",
    placeholders: [
      { name: "name", hint: "the invitee's name, or “there”" },
      { name: "inviter", hint: "who invited them" },
      { name: "org", hint: "the organization" },
      { name: "role", hint: "the role they were given" },
      { name: "link", hint: "the set-password link", required: true },
    ],
    defaultSubject: "{inviter} added you to {org} on MultiPost Studio",
    defaultBody: "Hi {name},\n\n{inviter} added you to {org} as {role}.\nChoose a password to finish setting up your account (the link is valid for 7 days):\n{link}",
  },
  {
    key: "invite_existing",
    label: "Team invitation (existing account)",
    when: "Sent when someone who already has an account is added to a team.",
    placeholders: [
      { name: "name", hint: "the invitee's name, or “there”" },
      { name: "inviter", hint: "who invited them" },
      { name: "org", hint: "the organization" },
      { name: "role", hint: "the role they were given" },
      { name: "link", hint: "a link into the workspace", required: true },
    ],
    defaultSubject: "{inviter} added you to {org} on MultiPost Studio",
    defaultBody: "Hi {name},\n\n{inviter} added you to {org} as {role}.\nYou can sign in with your existing MultiPost Studio password:\n{link}",
  },
];

export const templateDef = (key: string): TemplateDef | undefined => TEMPLATES.find((t) => t.key === key);
export const isTemplateKey = (v: unknown): v is TemplateKey => TEMPLATES.some((t) => t.key === v);

export const SUBJECT_MAX = 150;
export const BODY_MAX = 3000;
const PLACEHOLDER_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]))];
}

/** Everything wrong with a proposed version, in plain words. Empty means it can be saved. */
export function validateTemplate(key: string, subject: unknown, body: unknown): string[] {
  const def = templateDef(key);
  if (!def) return ["Unknown template"];
  const errors: string[] = [];
  if (typeof subject !== "string" || typeof body !== "string") return ["Subject and body are required"];
  const s = subject.trim();
  const b = body.trim();
  if (!s) errors.push("The subject can't be empty");
  if (!b) errors.push("The body can't be empty");
  if (/[\r\n]/.test(subject.trim())) errors.push("The subject must be a single line");
  if (s.length > SUBJECT_MAX) errors.push(`The subject can be up to ${SUBJECT_MAX} characters`);
  if (b.length > BODY_MAX) errors.push(`The body can be up to ${BODY_MAX} characters`);
  const allowed = new Set(def.placeholders.map((p) => p.name));
  const used = new Set([...placeholdersIn(s), ...placeholdersIn(b)]);
  const unknown = [...used].filter((p) => !allowed.has(p));
  if (unknown.length) errors.push(`Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `{${u}}`).join(", ")}. Use only ${def.placeholders.map((p) => `{${p.name}}`).join(", ")}`);
  for (const p of def.placeholders) if (p.required && !placeholdersIn(b).includes(p.name)) errors.push(`The body must include {${p.name}} (${p.hint})`);
  return errors;
}

/** Replace the allowed placeholders. Values are inserted as plain text; a value containing "{link}" is not expanded again. */
export function render(text: string, vars: Partial<Record<string, string>>): string {
  return text.replace(PLACEHOLDER_RE, (whole, name: string) => (name in vars ? (vars[name] ?? "") : whole));
}

/** Sample values for the preview and the test send. */
export const SAMPLE_VARS: Record<string, string> = { name: "Alex", inviter: "Sam", org: "Acme Studio", role: "editor", link: "https://app.example.com/example-link" };

/** Strip anything that could break a one-line header from a rendered subject. */
export function safeSubject(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim().slice(0, SUBJECT_MAX);
}
