import { ReelConfig, StopIndex } from "./types.js";

export const REELS: readonly ReelConfig[] = [
  { reelId: 1, direction: "up_to_down", symbols: ["複", "復", "附", "負", "腹"] },
  { reelId: 2, direction: "down_to_up", symbols: ["象", "向", "像", "相", "項"] },
  { reelId: 3, direction: "up_to_down", symbols: ["公", "工", "攻", "功", "恭"] },
  { reelId: 4, direction: "down_to_up", symbols: ["場", "廠", "昶", "敞", "厂"] }
] as const;

export function createStops(rand: () => number = Math.random): [StopIndex, StopIndex, StopIndex, StopIndex] {
  const roll = (): StopIndex => {
    const value = Math.floor(rand() * 5);
    if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4) {
      return value;
    }
    return 0;
  };

  return [roll(), roll(), roll(), roll()];
}

export function symbolAt(reelId: 1 | 2 | 3 | 4, index: StopIndex): string {
  const reel = REELS[reelId - 1];
  return reel.symbols[index];
}

export function resolveSymbols(stops: [StopIndex, StopIndex, StopIndex, StopIndex]): [string, string, string, string] {
  return [
    symbolAt(1, stops[0]),
    symbolAt(2, stops[1]),
    symbolAt(3, stops[2]),
    symbolAt(4, stops[3])
  ];
}

export function isJackpot(stops: [StopIndex, StopIndex, StopIndex, StopIndex]): boolean {
  return stops[0] === 0 && stops[1] === 0 && stops[2] === 0 && stops[3] === 0;
}
