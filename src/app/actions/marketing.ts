"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { sendGenericEmail } from "@/lib/adapters/email";
import { getSettings } from "@/lib/settings";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export type ContactState = { ok: boolean; error?: string };

const schema = z.object({
  name: z.string().min(2, "Enter your name").max(120),
  email: z.string().email("Enter a valid email"),
  topic: z.enum(["sales", "support", "press", "feedback"]),
  message: z.string().min(10, "Add a few more details").max(4000),
});

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** Public contact form → emails the workspace support address. Rate-limited per IP. */
export async function submitContactAction(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").trim(),
    topic: formData.get("topic") ?? "sales",
    message: formData.get("message"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };

  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ||
    (await headers()).get("x-real-ip") ||
    "unknown";
  try {
    await enforceRateLimit(`contact:${ip}`, 3, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: "Too many messages from here. Try again later." };
    throw e;
  }

  const d = parsed.data;
  const to = (await getSettings()).supportEmail;
  const res = await sendGenericEmail({
    to,
    subject: `[Contact · ${d.topic}] ${d.name}`,
    text: `From: ${d.name} <${d.email}>\nTopic: ${d.topic}\n\n${d.message}`,
    html: `<p><strong>From:</strong> ${esc(d.name)} &lt;${esc(d.email)}&gt;</p><p><strong>Topic:</strong> ${d.topic}</p><pre style="white-space:pre-wrap;font-family:inherit">${esc(d.message)}</pre>`,
  });

  if (!res.ok) {
    logger.error({ topic: d.topic }, "contact form delivery failed");
    return { ok: false, error: `Couldn't send right now — email us directly at ${to}.` };
  }
  return { ok: true };
}
