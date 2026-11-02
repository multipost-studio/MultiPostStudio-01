import { describe, it, expect } from "vitest";
import { IGNORED_ERRORS, dropBenignBrowserEvent, isBackgroundNavigationFetchFailure } from "./sentry-noise";

const ignored = (message: string) => IGNORED_ERRORS.some((p) => (typeof p === "string" ? message.includes(p) : p.test(message)));

describe("IGNORED_ERRORS", () => {
  it("ignores both wordings of a stale-deployment server action", () => {
    expect(ignored("Failed to find Server Action. This request might be from an older or newer deployment. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action")).toBe(true);
    expect(ignored('Server Action "abc123" was not found on the server.')).toBe(true);
  });

  it("ignores a client dropping a request, but not an error that merely contains the word", () => {
    expect(ignored("aborted")).toBe(true);
    expect(ignored("The destination stream closed early")).toBe(true);
    expect(ignored("Payment aborted because the card was declined")).toBe(false);
    expect(ignored("Cannot read properties of undefined")).toBe(false);
  });
});

const failedFetch = (breadcrumb?: string) => ({
  exception: { values: [{ type: "TypeError", value: "Failed to fetch (www.multipoststudio.online)" }] },
  breadcrumbs: [{ message: "GET /signup" }, ...(breadcrumb ? [{ message: breadcrumb }] : [])],
});

describe("dropBenignBrowserEvent", () => {
  it("drops a failed fetch that happened while Next was loading a page in the background", () => {
    const e = failedFetch("Failed to fetch RSC payload for https://www.multipoststudio.online/signup. Falling back to browser navigation.");
    expect(isBackgroundNavigationFetchFailure(e)).toBe(true);
    expect(dropBenignBrowserEvent(e)).toBeNull();
  });

  it("keeps a failed fetch from the app's own requests (a real outage)", () => {
    const e = failedFetch();
    expect(dropBenignBrowserEvent(e)).toBe(e);
  });

  it("keeps every other error, even with that breadcrumb", () => {
    const e = { exception: { values: [{ type: "TypeError", value: "x is not a function" }] }, breadcrumbs: [{ message: "Failed to fetch RSC payload" }] };
    expect(dropBenignBrowserEvent(e)).toBe(e);
    expect(dropBenignBrowserEvent({})).toEqual({});
  });
});
