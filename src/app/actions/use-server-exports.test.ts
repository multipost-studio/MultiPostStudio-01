import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Next.js refuses to build a "use server" file that exports anything but async functions (and types). Unit tests import
 * such files directly and cannot see that, so the failure only appears at `next build`. This catches it earlier.
 */
const DIR = join(process.cwd(), "src/app/actions");
const files = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe('"use server" modules export only async functions and types', () => {
  it("finds the action modules", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("has no exported constants, classes or synchronous functions", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(DIR, f), "utf8");
      if (!/^\s*["']use server["']/.test(src)) continue;
      for (const line of src.split(/\r?\n/)) {
        if (/^export\s+(const|let|var|class|enum)\b/.test(line)) offenders.push(`${f}: ${line.trim().slice(0, 80)}`);
        if (/^export\s+function\b/.test(line)) offenders.push(`${f}: ${line.trim().slice(0, 80)}`);
        if (/^export\s+default\b/.test(line)) offenders.push(`${f}: ${line.trim().slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
