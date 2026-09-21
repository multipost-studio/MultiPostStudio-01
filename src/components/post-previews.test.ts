import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PostPreview } from "./post-previews";
import { InstagramGridPreview } from "./instagram-grid-preview";
import { PreviewControls } from "./preview-controls";

describe("PostPreview", () => {
  const defaultProps = {
    platform: "x",
    contentType: "post",
    handle: "@brand",
    name: "Brand Account",
    body: "Launching our new feature today! #launch #growth",
    media: [
      {
        url: "https://images.unsplash.com/photo-1?w=800",
        kind: "image",
        width: 1200,
        height: 675,
      },
    ],
  };

  it("renders light mode preview by default", () => {
    const html = renderToStaticMarkup(React.createElement(PostPreview, defaultProps));
    expect(html).toContain("Brand Account");
    expect(html).toContain("Launching our new feature today!");
    expect(html).toContain("desktop · light");
    expect(html).toContain("color-scheme:light");
  });

  it("renders dark mode preview when theme='dark'", () => {
    const html = renderToStaticMarkup(
      React.createElement(PostPreview, { ...defaultProps, theme: "dark" }),
    );
    expect(html).toContain("desktop · dark");
    expect(html).toContain("color-scheme:dark");
    expect(html).toContain("background-color:#121212");
  });

  it("applies mobile container constraints when device='mobile'", () => {
    const html = renderToStaticMarkup(
      React.createElement(PostPreview, { ...defaultProps, device: "mobile" }),
    );
    expect(html).toContain("mobile · light");
    expect(html).toContain("max-w-[340px]");
  });

  it("renders 9:16 safe-zone overlay on vertical content when showSafeZone is true", () => {
    const html = renderToStaticMarkup(
      React.createElement(PostPreview, {
        ...defaultProps,
        platform: "instagram",
        contentType: "reel",
        showSafeZone: true,
      }),
    );
    expect(html).toContain("SAFE ZONE");
    expect(html).toContain("Top UI (Status / Sound)");
    expect(html).toContain("Bottom UI (Caption / Audio)");
    expect(html).toContain("Safe zone guides active");
  });

  it("does not render safe-zone overlay when showSafeZone is false", () => {
    const html = renderToStaticMarkup(
      React.createElement(PostPreview, {
        ...defaultProps,
        platform: "instagram",
        contentType: "reel",
        showSafeZone: false,
      }),
    );
    expect(html).not.toContain("SAFE ZONE");
    expect(html).not.toContain("Safe zone guides active");
  });

  it("renders Instagram 3x3 profile grid when viewMode='grid'", () => {
    const html = renderToStaticMarkup(
      React.createElement(PostPreview, {
        ...defaultProps,
        platform: "instagram",
        contentType: "feed",
        viewMode: "grid",
      }),
    );
    expect(html).toContain("3×3 Profile Grid");
    expect(html).toContain("3×3 Feed Simulation");
    expect(html).toContain("photo-1");
    expect(html).toContain("New");
  });

  it("renders X thread pagination controls when thread content is provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(PostPreview, {
        ...defaultProps,
        platform: "x",
        contentType: "thread",
        body: "First tweet in thread\n\n---\n\nSecond tweet in thread\n\n---\n\nThird tweet in thread",
      }),
    );
    expect(html).toContain("Thread (3 tweets)");
    expect(html).toContain("1 / 3");
  });
});

describe("InstagramGridPreview", () => {
  it("renders profile header, stats, and 9 grid cells", () => {
    const html = renderToStaticMarkup(
      React.createElement(InstagramGridPreview, {
        handle: "multipost",
        name: "MultiPost Studio",
        media: [
          {
            url: "https://images.unsplash.com/test-draft.jpg",
            kind: "image",
          },
        ],
        body: "Draft caption for grid test",
        theme: "light",
      }),
    );

    expect(html).toContain("multipost");
    expect(html).toContain("MultiPost Studio");
    expect(html).toContain("49"); // posts stat
    expect(html).toContain("12.8K"); // followers stat
    expect(html).toContain("test-draft.jpg");
    expect(html).toContain("New");
  });

  it("renders dark theme properly", () => {
    const html = renderToStaticMarkup(
      React.createElement(InstagramGridPreview, {
        handle: "darkbrand",
        media: [],
        theme: "dark",
      }),
    );
    expect(html).toContain("bg-black");
    expect(html).toContain("text-neutral-100");
  });
});

describe("PreviewControls", () => {
  it("renders device and theme toggles with active states", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewControls, {
        device: "desktop",
        onDeviceChange: () => {},
        theme: "dark",
        onThemeChange: () => {},
        hasVerticalMedia: true,
        showSafeZone: true,
        onShowSafeZoneChange: () => {},
        hasGridSupport: true,
        viewMode: "grid",
        onViewModeChange: () => {},
      }),
    );

    expect(html).toContain("Desktop");
    expect(html).toContain("Mobile");
    expect(html).toContain("Light");
    expect(html).toContain("Dark");
    expect(html).toContain("3×3 Grid");
    expect(html).toContain("Safe Zones");
    expect(html).toContain('aria-pressed="true"');
  });

  it("omits grid and safe zone buttons when not applicable", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewControls, {
        device: "desktop",
        onDeviceChange: () => {},
        theme: "light",
        onThemeChange: () => {},
        hasVerticalMedia: false,
        hasGridSupport: false,
      }),
    );

    expect(html).not.toContain("3×3 Grid");
    expect(html).not.toContain("Safe Zones");
  });
});
