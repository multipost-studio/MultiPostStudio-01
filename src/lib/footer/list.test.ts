import { describe, it, expect } from "vitest";
import { moveItem, removeItem, toggleHidden, updateItem } from "./list";

const abc = [{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "c", n: 3 }];

describe("footer list helpers", () => {
  it("moves an item up or down and stops at the ends", () => {
    expect(moveItem(abc, "b", -1).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(moveItem(abc, "b", 1).map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(moveItem(abc, "a", -1)).toBe(abc);
    expect(moveItem(abc, "c", 1)).toBe(abc);
    expect(moveItem(abc, "zzz", 1)).toBe(abc);
  });

  it("never changes the list it was given", () => {
    const snapshot = JSON.stringify(abc);
    moveItem(abc, "b", 1);
    updateItem(abc, "a", { n: 9 });
    removeItem(abc, "c");
    expect(JSON.stringify(abc)).toBe(snapshot);
  });

  it("updates and removes by id", () => {
    expect(updateItem(abc, "b", { n: 20 })[1]).toEqual({ id: "b", n: 20 });
    expect(removeItem(abc, "b").map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("toggles a hidden href without duplicates", () => {
    expect(toggleHidden([], "/x", false)).toEqual(["/x"]);
    expect(toggleHidden(["/x"], "/x", false)).toEqual(["/x"]);
    expect(toggleHidden(["/x", "/y"], "/x", true)).toEqual(["/y"]);
  });
});
