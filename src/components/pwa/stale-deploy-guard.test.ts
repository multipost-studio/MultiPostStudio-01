import { describe, it, expect } from "vitest";
import { isStaleDeployError } from "./stale-deploy-guard";

describe("isStaleDeployError", () => {
  it("recognises Next's error for a server action the new deployment doesn't have", () => {
    const err = Object.assign(new Error('Server Action "608dc69a10a93a885b1872f22621e6d9347ec2fa1d" was not found on the server.'), { name: "UnrecognizedActionError" });
    expect(isStaleDeployError(err)).toBe(true);
  });

  it("matches on the message alone too, in case the error name is lost in transit", () => {
    expect(isStaleDeployError({ message: 'Server Action "abc" was not found on the server. Read more: https://nextjs.org' })).toBe(true);
  });

  it("ignores everything else, including non-errors", () => {
    for (const v of [null, undefined, "boom", 42, new Error("Network request failed"), new TypeError("x is not a function"), { name: "ChunkLoadError", message: "Loading chunk 12 failed" }]) {
      expect(isStaleDeployError(v)).toBe(false);
    }
  });
});
