import { describe, expect, it } from "vitest";
import { jsonLd } from "./json-ld";

describe("jsonLd", () => {
  it("cannot be closed early by a </script> in a value", () => {
    const out = jsonLd({ headline: 'x</script><script>alert(1)</script>' });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
  });

  it("still parses back to exactly the same data", () => {
    const data = { a: "1 < 2 & 3 > 2", b: [" line", " para"], n: 5, nested: { ok: true } };
    expect(JSON.parse(jsonLd(data))).toEqual(data);
  });

  it("leaves ordinary data alone", () => {
    expect(jsonLd({ name: "MultiPost Studio", n: 1 })).toBe('{"name":"MultiPost Studio","n":1}');
  });
});
