/**
 * AI Inbox Triage & Suggested Reply Generation
 */

export const TRIAGE_CATEGORIES = [
  "question",
  "complaint",
  "sales",
  "support",
  "urgent",
  "spam",
] as const;

export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];

export interface TriageResult {
  category: TriageCategory;
  sentiment: "positive" | "neutral" | "negative";
  priority: number; // 0 = P0 Urgent, 1 = High, 2 = Medium, 3 = Low
  confidence: number;
  reason: string;
}

export function classifyMessage(text: string): TriageResult {
  const lower = text.toLowerCase().trim();

  // 1. Spam detection
  if (
    /(\b(crypto|bitcoin|forex|dm me to earn|whatsapp \+|click here|telegram:|giveaway winner|free followers|onlyfans)\b)/i.test(
      lower
    ) ||
    lower.length > 500 && /(http|https):\/\/[^\s]+.*(http|https):\/\/[^\s]+/i.test(lower)
  ) {
    return {
      category: "spam",
      sentiment: "neutral",
      priority: 3,
      confidence: 0.95,
      reason: "Matched automated promotion or spam keyword patterns",
    };
  }

  // 2. Urgent signals
  if (
    /\b(urgent|asap|emergency|immediately|critical|security breach|lawsuit|attorney|legal action|hacked|broken in production)\b/i.test(
      lower
    )
  ) {
    return {
      category: "urgent",
      sentiment: "negative",
      priority: 0,
      confidence: 0.9,
      reason: "High-severity urgency indicator detected",
    };
  }

  // 3. Complaints & De-escalation
  if (
    /\b(disappointed|terrible|awful|worst|scam|waste of money|unacceptable|charge me|refund|fraud|cancel my|horrible service)\b/i.test(
      lower
    )
  ) {
    return {
      category: "complaint",
      sentiment: "negative",
      priority: 1,
      confidence: 0.88,
      reason: "Strong negative sentiment and dissatisfaction markers",
    };
  }

  // 4. Sales / Lead inquiry
  if (
    /\b(pricing|how much|cost|enterprise quote|demo|sales|buy|discount|trial|switch from|migrate to|plans? available)\b/i.test(
      lower
    )
  ) {
    return {
      category: "sales",
      sentiment: "positive",
      priority: 1,
      confidence: 0.85,
      reason: "Purchasing intent or plan inquiry keywords detected",
    };
  }

  // 5. Technical Support / Product help
  if (
    /\b(bug|error|not working|crash|failed|issue|can't login|password reset|stuck|help me with|integration failed)\b/i.test(
      lower
    )
  ) {
    return {
      category: "support",
      sentiment: "negative",
      priority: 1,
      confidence: 0.86,
      reason: "Technical or workflow blocker identified",
    };
  }

  // 6. Questions & Inquiries
  if (
    /\?|how do i|where can|is there a way|when will|does it support|do you have/i.test(
      lower
    )
  ) {
    return {
      category: "question",
      sentiment: "neutral",
      priority: 2,
      confidence: 0.8,
      reason: "User inquiry or question mark detected",
    };
  }

  // Positive feedback default
  if (/\b(love this|great job|awesome|congrats|thank you|thanks|kudos|amazing)\b/i.test(lower)) {
    return {
      category: "question",
      sentiment: "positive",
      priority: 2,
      confidence: 0.85,
      reason: "Appreciation and positive customer feedback",
    };
  }

  // Default fallback
  return {
    category: "question",
    sentiment: "neutral",
    priority: 2,
    confidence: 0.6,
    reason: "General conversation thread",
  };
}

export function generateSuggestedReply({
  category,
  text,
  authorName,
  platform,
  brandVoice: _brandVoice,
}: {
  category: TriageCategory;
  text: string;
  authorName: string;
  platform: string;
  brandVoice?: string | null;
}): string {
  const firstName = authorName.split(" ")[0] || "there";

  switch (category) {
    case "urgent":
      return `Hi ${firstName}, thank you for bringing this to our immediate attention. We're prioritizing this and our escalation team is looking into it right now. Please check your DMs or email for direct follow-up.`;
    case "complaint":
      return `Hi ${firstName}, we are very sorry to hear about your experience. We take this seriously and want to make it right immediately. Could you send us a direct message with your account details so we can investigate and resolve this for you?`;
    case "sales":
      return `Hi ${firstName}! Thanks for your interest! We'd love to show you how our platform can help. You can check our plans or book a quick personalized walkthrough here: https://cadence.app/pricing — feel free to DM us any specific questions!`;
    case "support":
      return `Hi ${firstName}, thanks for reaching out. We're sorry you ran into this glitch. Could you let us know what browser/device you're on, or send a screenshot via DM so our engineering team can inspect the issue?`;
    case "spam":
      return ``;
    case "question":
    default:
      if (/love|great|awesome|thanks|congrat/i.test(text)) {
        return `Thank you so much, ${firstName}! We really appreciate your support and are thrilled you're enjoying the platform! 🚀`;
      }
      return `Hi ${firstName}, thanks for reaching out on ${platform}! Great question. Let us know if you need more details, or drop us a direct message and we'll be happy to walk you through it!`;
  }
}
