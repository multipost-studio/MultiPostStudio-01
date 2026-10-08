import type { InsightAction } from "./types";

/**
 * "How do I...?" answers. Each topic points at a real route in this app (see
 * lib/nav.ts); the steps describe what is actually there, in plain words, and
 * stay deliberately short so they remain true as screens evolve.
 */
export interface HelpTopic {
  id: string;
  title: string;
  /** Words and phrases that should surface this topic. */
  keywords: string[];
  steps: string[];
  link: InsightAction;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "connect",
    title: "Connect a social account",
    keywords: ["connect", "link", "add account", "instagram", "facebook", "linkedin", "tiktok", "youtube", "pinterest", "threads", "bluesky", "twitter", "google business", "authorize", "oauth"],
    steps: ["Open Integrations from the sidebar.", "Choose the platform and sign in to approve access.", "Once connected, it appears as a channel in the composer."],
    link: { label: "Open Integrations", href: "/integrations" },
  },
  {
    id: "schedule",
    title: "Schedule a post",
    keywords: ["schedule", "post later", "publish later", "set a time", "queue a post", "plan a post", "automatic publish"],
    steps: ["Open the composer and pick the channels.", "Write your post and add media.", "Choose Schedule and set the date and time, or Add to queue.", "It appears on the calendar, where you can drag it to a new time."],
    link: { label: "Open the composer", href: "/composer/new" },
  },
  {
    id: "platform_limits",
    title: "Check character limits and platform rules",
    keywords: ["character limit", "too long", "hashtag limit", "platform rule", "validation", "readiness", "why can't i publish", "blocked", "image size", "video length"],
    steps: ["In the composer, each channel shows live checks for length, hashtags, mentions and media.", "Use Adapt for all channels to tailor one draft per platform.", "Anything blocking publishing is listed with the fix."],
    link: { label: "Open the composer", href: "/composer/new" },
  },
  {
    id: "ai_writing",
    title: "Write with AI",
    keywords: ["ai", "caption", "generate", "write for me", "hook", "rewrite", "brand voice", "assistant"],
    steps: ["Content Studio drafts hooks, captions and platform variants.", "Brand Brain teaches it your voice, so drafts sound like you.", "You can connect your own AI key under AI Providers."],
    link: { label: "Open Content Studio", href: "/studio" },
  },
  {
    id: "approvals",
    title: "Get posts approved",
    keywords: ["approval", "approve", "review workflow", "sign off", "client approval", "request changes"],
    steps: ["Posts that need a decision appear in Approvals.", "Reviewers approve, or request changes with a note.", "Approved posts continue to their scheduled time."],
    link: { label: "Open Approvals", href: "/approvals" },
  },
  {
    id: "team",
    title: "Invite teammates",
    keywords: ["invite", "teammate", "team member", "add user", "collaborator", "role", "permission", "client access"],
    steps: ["Open Team from the sidebar.", "Invite by email and choose a role (editor, creator, analyst, viewer and more).", "Roles decide who can create, approve or only view."],
    link: { label: "Open Team", href: "/team" },
  },
  {
    id: "reports",
    title: "Build a report",
    keywords: ["report", "export", "pdf", "share results", "client report", "white label"],
    steps: ["Open Reports and choose the report builder.", "Pick the widgets and date range.", "Share or schedule delivery to clients."],
    link: { label: "Open the report builder", href: "/reports/builder" },
  },
  {
    id: "calendar_import",
    title: "Import posts in bulk",
    keywords: ["import", "csv", "bulk", "upload posts", "spreadsheet"],
    steps: ["Open the calendar.", "Use Import CSV and follow the column guide.", "Imported posts appear on their dates, ready to review."],
    link: { label: "Open the calendar", href: "/calendar" },
  },
  {
    id: "best_time",
    title: "Find the best time to post",
    keywords: ["best time", "when to post", "optimal time", "peak hours"],
    steps: ["The calendar and composer show your best slot once you have enough published posts with metrics.", "It is measured from your own engagement, not a generic guess."],
    link: { label: "Open the calendar", href: "/calendar" },
  },
  {
    id: "recycling",
    title: "Reuse your best posts",
    keywords: ["recycle", "evergreen", "repost", "reuse", "republish"],
    steps: ["Mark a post as evergreen in the composer.", "Recycling re-queues top performers on a schedule you control, with frequency caps."],
    link: { label: "Open Recycling", href: "/recycling" },
  },
  {
    id: "automations",
    title: "Automate repetitive work",
    keywords: ["automation", "automate", "auto reply", "rule", "workflow", "trigger"],
    steps: ["Automations run rules for you, such as auto-replies and tagging.", "Create a rule, choose the trigger and the action, then switch it on."],
    link: { label: "Open Automations", href: "/automations" },
  },
  {
    id: "media",
    title: "Manage images and videos",
    keywords: ["media", "image", "video", "upload", "library", "asset", "photo"],
    steps: ["Upload once to the Media Library.", "Pick from it in any post, across every platform."],
    link: { label: "Open the Media Library", href: "/media" },
  },
  {
    id: "billing",
    title: "Change plan or see invoices",
    keywords: ["billing", "upgrade", "downgrade", "invoice", "subscription", "payment", "pricing", "plan", "cancel", "coupon"],
    steps: ["Open Billing in Settings.", "Compare plans, change interval, or view invoices."],
    link: { label: "Open Billing", href: "/settings/billing" },
  },
  {
    id: "notifications",
    title: "Control notifications",
    keywords: ["notification", "email alert", "mute", "alerts", "digest"],
    steps: ["Open Notifications in Settings.", "Choose which events email you or appear in the bell."],
    link: { label: "Open Notification settings", href: "/settings/notifications" },
  },
  {
    id: "security",
    title: "Secure your account",
    keywords: ["password", "2fa", "two factor", "authenticator", "security", "devices", "sign out everywhere"],
    steps: ["Security in Settings lets you change your password and turn on two-factor sign-in.", "Devices lists where you are signed in, and lets you revoke any of them."],
    link: { label: "Open Security", href: "/settings/security" },
  },
  {
    id: "api",
    title: "Use the API and webhooks",
    keywords: ["api", "api key", "webhook", "integration code", "developer", "zapier"],
    steps: ["API Keys creates keys for your own tools.", "Webhook Center sends events to a URL you control."],
    link: { label: "Open API Keys", href: "/settings/api" },
  },
  {
    id: "privacy",
    title: "Export or delete your data",
    keywords: ["delete my data", "export my data", "gdpr", "privacy", "erase", "data request"],
    steps: ["Privacy & Data in Settings lets you request an export, a correction or erasure.", "Requests are tracked and answered within the legal window."],
    link: { label: "Open Privacy & Data", href: "/settings/privacy" },
  },
  {
    id: "streak",
    title: "Keep your posting streak",
    keywords: ["streak", "consistency", "milestone", "daily posting"],
    steps: ["A day counts when you publish or schedule at least one post.", "Your streak and next milestone are on the Streak page."],
    link: { label: "Open Streak", href: "/insights/streak" },
  },
  {
    id: "support",
    title: "Contact support",
    keywords: ["support", "contact", "bug", "report a problem", "talk to a human", "feedback"],
    steps: ["Open Support in Settings to send a ticket.", "You can also use the feedback button in the top bar. It captures the page you were on."],
    link: { label: "Open Support", href: "/settings/support" },
  },
];
