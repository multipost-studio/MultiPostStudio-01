"use client";

import { useEffect } from "react";

/**
 * Root error boundary — catches failures in the root layout itself, where the
 * app's providers/fonts aren't available. Must render its own <html>/<body>.
 * Kept dependency-free and inline-styled so it works even if the design system
 * is what broke.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Forward to an error tracker here in production.
    console.error("global-error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "4rem 1.5rem",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#0b0b0c",
          color: "#e7e7e9",
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#8a8a92",
              margin: 0,
            }}
          >
            Application error
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "10px 0 0" }}>
            MultiPost Studio hit an unexpected error
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "#b3b3ba", margin: "12px 0 0" }}>
            The page failed to load. This has been logged. Try reloading — if it keeps
            happening, contact support and include the code below.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                color: "#8a8a92",
                marginTop: 14,
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: 28,
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={reset}
              style={{
                appearance: "none",
                border: "none",
                borderRadius: 8,
                padding: "10px 18px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                background: "#6d5cff",
                color: "#fff",
              }}
            >
              Reload page
            </button>
            <a
              href="/"
              style={{
                borderRadius: 8,
                padding: "10px 18px",
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                border: "1px solid #2a2a2e",
                color: "#e7e7e9",
              }}
            >
              Go to homepage
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
