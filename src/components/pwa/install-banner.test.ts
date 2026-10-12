import { describe, it, expect } from "vitest";
import { isIosBrowserTab } from "./install-banner";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const MAC = IPAD_AS_MAC;
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IOS_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1";

describe("isIosBrowserTab", () => {
  it("is true for an iPhone showing the site in a browser tab", () => {
    expect(isIosBrowserTab({ userAgent: IPHONE, maxTouchPoints: 5 }, false)).toBe(true);
    expect(isIosBrowserTab({ userAgent: IOS_CHROME, maxTouchPoints: 5 }, false)).toBe(true);
  });

  it("recognises an iPad that reports itself as a Mac (touch points tell them apart from a real Mac)", () => {
    expect(isIosBrowserTab({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }, false)).toBe(true);
    expect(isIosBrowserTab({ userAgent: MAC, maxTouchPoints: 0 }, false)).toBe(false);
  });

  it("is false once the app is installed, by either signal iOS uses", () => {
    expect(isIosBrowserTab({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true }, false)).toBe(false);
    expect(isIosBrowserTab({ userAgent: IPHONE, maxTouchPoints: 5 }, true)).toBe(false);
  });

  it("is false on Android and desktop, which get the real install prompt instead", () => {
    expect(isIosBrowserTab({ userAgent: ANDROID, maxTouchPoints: 5 }, false)).toBe(false);
  });
});
