/**
 * The short explanations shown next to each setting in /admin/plans (the "i" icon), in the plain style of Buffer's pricing page.
 * Every plan setting and every feature switch has one: a test fails if a new one is added without.
 */

export type PlanSettingKey =
  | "priceMonthly"
  | "priceAnnual"
  | "priceMonthlyInr"
  | "priceAnnualInr"
  | "annualDiscountPct"
  | "trialDays"
  | "maxChannels"
  | "maxWorkspaces"
  | "maxUsers"
  | "maxScheduled"
  | "maxIdeas"
  | "aiCredits"
  | "storageMb"
  | "analyticsRetentionDays"
  | "apiRateLimit"
  | "maxApiKeys"
  | "automationLimit";

/** Plan numbers other settings depend on, for the examples (an example uses what is typed in the form right now). */
export type PlanNumbers = { maxChannels: number; maxScheduled: number };

const UNLIMITED = "0 means unlimited.";

export function settingInfo(key: PlanSettingKey, plan: PlanNumbers): string {
  switch (key) {
    case "priceMonthly":
      return "What a customer pays each month, in the smallest unit of the currency (cents). 1800 is $18.00.";
    case "priceAnnual":
      return "What a customer pays for a full year, in cents. This is the yearly option on the pricing page.";
    case "priceMonthlyInr":
      return "The monthly price in paise for customers billed in India. It is its own price, not a conversion. 0 hides the INR option.";
    case "priceAnnualInr":
      return "The yearly price in paise for customers billed in India. It is its own price, not a conversion.";
    case "annualDiscountPct":
      return "Only the label on the pricing page (for example \"2 months free\"). It does not change the yearly price: set that above.";
    case "trialDays":
      return "Free days before the first payment. 0 means no trial.";
    case "maxChannels":
      return `How many social accounts a customer can connect. ${UNLIMITED}`;
    case "maxWorkspaces":
      return `How many separate workspaces (brands or clients) one organisation can create. ${UNLIMITED}`;
    case "maxUsers":
      return `How many people can be members of one organisation. ${UNLIMITED}`;
    case "maxScheduled": {
      const per = Math.max(0, Math.round(plan.maxScheduled || 0));
      const ch = Math.max(1, Math.round(plan.maxChannels || 0) || 1);
      if (per <= 0) return "How many posts can wait to be published on each channel at one time. It is unlimited now.";
      return (
        `How many posts can wait to be published on each connected channel at one time. With ${ch} connected channel${ch === 1 ? "" : "s"} ` +
        `and a limit of ${per}, a customer can schedule ${per * ch} post${per * ch === 1 ? "" : "s"} (${per} for each channel). ` +
        `Once a scheduled post is published, that channel can schedule another. ${UNLIMITED}`
      );
    }
    case "maxIdeas":
      return `How many ideas a customer can keep on the Ideas board at once, across the whole organisation. ${UNLIMITED}`;
    case "aiCredits":
      return `AI generations a customer can use each month (captions, images, rewrites). They reset every month. ${UNLIMITED}`;
    case "storageMb":
      return `Total media a customer can store in the library, in MB. 1000 MB is about 1 GB. ${UNLIMITED}`;
    case "analyticsRetentionDays":
      return "How many days of past results the analytics pages show. Older data is kept but not shown.";
    case "apiRateLimit":
      return "How many API requests a customer can make each minute. 0 means no API access. Turn on the API access feature too.";
    case "maxApiKeys":
      return `How many API keys can be active at once (revoked keys do not count). ${UNLIMITED} Needs the API access feature.`;
    case "automationLimit":
      return `How many automations a customer can have. ${UNLIMITED} Needs the Automations feature.`;
  }
}

/** One-line explanation for each feature switch, keyed by the entitlement key. */
export const ENTITLEMENT_INFO: Record<string, string> = {
  scheduling: "Schedule posts to publish later at a chosen date and time.",
  bulk_scheduling: "Schedule or edit many posts in one go.",
  csv_import: "Create many posts at once by importing a CSV file.",
  recurring_posts: "Repeat a post daily, weekly or monthly.",
  content_calendar: "The calendar view of everything scheduled and published.",
  queue: "Fill posting time slots automatically with the Add to queue button.",
  first_comment: "Post a comment under a post as soon as it is published (good for hashtags).",
  drafts: "Save posts as drafts and finish them later.",
  evergreen_recycling: "Republish posts marked evergreen again after a while.",

  platform_instagram: "Connect Instagram accounts and publish to them.",
  platform_facebook: "Connect Facebook Pages and publish to them.",
  platform_linkedin: "Connect LinkedIn profiles and publish to them.",
  platform_x: "Connect X (Twitter) accounts and publish to them.",
  platform_tiktok: "Connect TikTok accounts and publish to them.",
  platform_youtube: "Connect YouTube channels and publish to them.",
  platform_pinterest: "Connect Pinterest accounts and publish Pins.",
  platform_threads: "Connect Threads profiles and publish to them.",
  platform_bluesky: "Connect Bluesky accounts and publish to them.",
  platform_gbp: "Connect Google Business Profile locations and publish updates.",

  ai_writer: "Write and rewrite captions with AI.",
  ai_image: "Create images with AI.",
  ai_video: "Create short videos with AI.",
  ai_hashtags: "Suggest hashtags with AI.",
  ai_ideas: "Suggest post ideas with AI.",
  ai_repurpose: "Turn long content, like an article, into social posts.",
  ai_best_time: "Suggest the best times to post from past results.",
  ai_variations: "Create several versions of one caption to choose from.",
  ai_content_score: "Score a draft before it is posted.",
  ai_recommendations: "Suggestions to improve results, based on past performance.",

  analytics_basic: "Essential numbers: reach, engagement and top posts.",
  analytics_advanced: "Deeper analytics: comparisons, trends and per-post detail.",
  audience_analytics: "Who the audience is: demographics and activity.",
  competitor_analytics: "Compare results with other accounts.",
  report_builder: "Build and export custom reports.",
  scheduled_reports: "Email reports automatically on a schedule.",

  team_members: "Invite other people into the organisation. The number is set by the member limit.",
  roles_permissions: "Choose what each team member can do.",
  approval_workflows: "Require a post to be approved before it is published.",
  internal_notes: "Comment on posts and leave notes for the team.",
  client_accounts: "Manage clients in separate workspaces with their own channels.",
  activity_log: "A record of who did what in the organisation.",

  custom_branding: "Use the customer's own logo and colours on shared pages.",
  white_label: "Remove MultiPost Studio branding from what clients see.",
  custom_domain: "Serve client pages from the customer's own domain.",

  api_access: "Use the API with API keys. Set how many keys and how many requests per minute in the limits.",
  webhooks: "Send an event to another system when something happens, like a post published.",
  zapier: "Connect to other apps through Zapier or Make.",
  automations: "Rules that act on their own, like replying or pausing a channel. The number is set by the automation limit.",
  export_csv: "Download data as CSV files.",
  export_pdf: "Download reports as PDF files.",
};
