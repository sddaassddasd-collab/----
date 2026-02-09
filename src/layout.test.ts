import { describe, expect, it } from "vitest";
import { chooseGrid, paginatePlayerIds, PAGE_SIZE } from "./layout.js";

describe("layout", () => {
  it("paginates player ids with page size 30", () => {
    const ids = Array.from({ length: 65 }, (_, i) => `p-${i + 1}`);

    expect(PAGE_SIZE).toBe(30);
    expect(paginatePlayerIds(ids, 0)).toHaveLength(30);
    expect(paginatePlayerIds(ids, 1)).toHaveLength(30);
    expect(paginatePlayerIds(ids, 2)).toHaveLength(5);
  });

  it("chooses a 6x5 grid for 30 players", () => {
    expect(chooseGrid(30)).toEqual({ rows: 5, cols: 6 });
  });

  it("returns 1x1 for empty state", () => {
    expect(chooseGrid(0)).toEqual({ rows: 1, cols: 1 });
  });
});
