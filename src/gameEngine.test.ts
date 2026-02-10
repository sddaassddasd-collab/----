import { describe, expect, it } from "vitest";
import { createStops, isJackpot, resolveSymbols, symbolAt } from "./gameEngine.js";

describe("gameEngine", () => {
  it("maps reel symbols correctly", () => {
    expect(symbolAt(1, 0)).toBe("複");
    expect(symbolAt(2, 0)).toBe("象");
    expect(symbolAt(3, 0)).toBe("公");
    expect(symbolAt(4, 0)).toBe("場");
  });

  it("resolves symbols from stop indexes", () => {
    const symbols = resolveSymbols([0, 1, 2, 3]);
    expect(symbols).toEqual(["複", "向", "攻", "敞"]);
  });

  it("detects jackpot only when all reels stop at index 0", () => {
    expect(isJackpot([0, 0, 0, 0])).toBe(true);
    expect(isJackpot([0, 0, 1, 0])).toBe(false);
  });

  it("creates deterministic stops with a provided random function", () => {
    const values = [0.01, 0.22, 0.44, 0.88];
    let index = 0;
    const rand = () => values[index++ % values.length];

    expect(createStops(rand)).toEqual([0, 1, 2, 4]);
  });
});
