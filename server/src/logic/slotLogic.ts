import type { GameMode, Reels } from "../../../shared/types.js";

// 固定 4 欄；每欄各自抽一個符號組成最後結果。
const REEL_STRIPS = [
  ["複", "0", "1", "2", "3"],
  ["象", "10", "11", "12", "13"],
  ["公", "20", "21", "22", "23"],
  ["場", "30", "31", "32", "33"]
] as const;

const WIN_REELS: Reels = ["複", "象", "公", "場"];
const EMPTY_REELS: Reels = ["-", "-", "-", "-"];

export interface SpinResult {
  finalReels: Reels;
  isWin: boolean;
  resultText: string;
}

export function getEmptyReels(): Reels {
  return EMPTY_REELS;
}

function pickOne<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? items[0];
}

function reelsEqual(a: Reels, b: Reels): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function buildResultText(mode: GameMode, isWin: boolean): string {
  if (mode === "official") {
    return isWin ? "恭喜中獎" : "太可惜了><";
  }
  return isWin ? "練習中獎，可繼續挑戰" : "練習完成，再試一次";
}

/**
 * 進行一次拉霸，直接回傳最終結果。
 * 規則：
 * 1. 各欄獨立隨機。
 * 2. 四欄同時為「複 象 公 場」即視為中獎。
 * 3. resultText 依 mode 決定文案。
 */
export function spinSlot(mode: GameMode): SpinResult {
  const finalReels: Reels = [
    pickOne(REEL_STRIPS[0]),
    pickOne(REEL_STRIPS[1]),
    pickOne(REEL_STRIPS[2]),
    pickOne(REEL_STRIPS[3])
  ];

  const isWin = reelsEqual(finalReels, WIN_REELS);

  return {
    finalReels,
    isWin,
    resultText: buildResultText(mode, isWin)
  };
}
