import type { AccountTier } from "./types";

/**
 * X's users/me `subscription_type` is "Basic", "Premium", "PremiumPlus" or
 * "None". Every paid tier gets longer posts; "None" is the standard 280.
 * Anything else (field missing, new value) is "unknown" — callers then use the
 * safe standard limit and tell the user the account type is unverified.
 */
export function xTierFromSubscription(subscriptionType: unknown): AccountTier {
  if (typeof subscriptionType !== "string") return "unknown";
  switch (subscriptionType.toLowerCase()) {
    case "none":
      return "standard";
    case "basic":
    case "premium":
    case "premiumplus":
      return "premium";
    default:
      return "unknown";
  }
}

/** Read the stored account metadata (a JSON string on SocialAccount) and resolve the tier for a platform. */
export function accountTierFor(platform: string, accountMetadata: string | null | undefined): AccountTier {
  if (platform !== "x" || !accountMetadata) return "unknown";
  try {
    const meta = JSON.parse(accountMetadata) as { xSubscriptionType?: unknown };
    return xTierFromSubscription(meta.xSubscriptionType);
  } catch {
    return "unknown";
  }
}
