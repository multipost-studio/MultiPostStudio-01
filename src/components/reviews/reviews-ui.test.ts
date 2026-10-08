import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Stars } from "./stars";
import { ReviewCard } from "./review-card";
import { RatingSummary } from "./summary";
import type { PublicReview } from "@/lib/reviews/model";

const review: PublicReview = {
  id: "r1",
  authorName: "Maya <b>Chen</b>",
  authorRole: "Social lead, Acme",
  avatarUrl: null,
  rating: 4,
  title: "Saves hours",
  body: "We schedule a week in one sitting.",
  adminReply: "Thank you, Maya!",
  featured: true,
  createdAt: "2026-09-30T10:00:00.000Z",
};

describe("review UI", () => {
  it("labels the stars for screen readers, fractions included", () => {
    expect(renderToStaticMarkup(createElement(Stars, { rating: 4 }))).toContain('aria-label="4 out of 5 stars"');
    expect(renderToStaticMarkup(createElement(Stars, { rating: 4.6 }))).toContain('aria-label="4.6 out of 5 stars"');
    expect(renderToStaticMarkup(createElement(Stars, { rating: 99 }))).toContain("5 out of 5 stars");
  });

  it("renders a review with its reply, and escapes anything in the name", () => {
    const html = renderToStaticMarkup(createElement(ReviewCard, { review }));
    expect(html).toContain("Saves hours");
    expect(html).toContain("We schedule a week in one sitting.");
    expect(html).toContain("Reply from the MultiPost Studio team");
    expect(html).toContain("Sep 2026");
    expect(html).not.toContain("<b>Chen</b>");
    expect(html).toContain("&lt;b&gt;Chen&lt;/b&gt;");
    // No photo: initials stand in.
    expect(html).toContain(">M");
  });

  it("omits the reply and headline blocks when there are none", () => {
    const html = renderToStaticMarkup(createElement(ReviewCard, { review: { ...review, adminReply: null, title: null, featured: false } }));
    expect(html).not.toContain("Reply from");
    expect(html).not.toContain("Featured");
  });

  it("summarises the average and each rating's count", () => {
    const html = renderToStaticMarkup(createElement(RatingSummary, { summary: { count: 7, average: 4.3, distribution: [4, 2, 1, 0, 0] } }));
    expect(html).toContain("4.3");
    expect(html).toContain("from 7 reviews");
    expect(html).toContain("5 ★");
  });
});
