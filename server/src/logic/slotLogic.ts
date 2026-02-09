import type { GameMode, ReelId, Reels, StopIndex } from "../../../shared/types.js";

// 固定 4 欄；每欄各自抽一個符號組成最後結果。
const REEL_STRIPS = [
  ["複", "0", "1", "2", "3"],
  ["象", "10", "11", "12", "13"],
  ["公", "20", "21", "22", "23"],
  ["場", "30", "31", "32", "33"]
] as const;

const WIN_REELS: Reels = ["複", "象", "公", "場"];
const EMPTY_REELS: Reels = ["-", "-", "-", "-"];

export interface SettleResult {
  isWin: boolean;
  resultText: string;
}

export function getEmptyReels(): Reels {
  return EMPTY_REELS;
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

export function symbolAt(reelId: ReelId, stopIndex: StopIndex): string {
  const strip = REEL_STRIPS[reelId - 1];
  return strip[stopIndex] ?? strip[0];
}

export function settleByReels(mode: GameMode, reels: Reels): SettleResult {
  const isWin = reelsEqual(reels, WIN_REELS);
  return {
    isWin,
    resultText: buildResultText(mode, isWin)
  };
}
