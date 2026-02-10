import type { ClientState } from "../../../shared/types";

const TOTAL_REELS = 4;
const INDEX0_SYMBOLS = ["複", "象", "公", "場"] as const;

export interface RankedClientEntry {
  socketId: string;
  state: ClientState;
  rank: number;
}

export interface RankSummary {
  rank: number | null;
  total: number;
}

export function progressFromState(state: ClientState): { accuracy: number; completedCount: number } {
  const reels = state.reels;
  let correctCount = 0;
  let completedCount = 0;

  for (let index = 0; index < TOTAL_REELS; index += 1) {
    const symbol = reels[index];
    if (symbol && symbol !== "-") {
      completedCount += 1;
    }
    if (symbol === INDEX0_SYMBOLS[index]) {
      correctCount += 1;
    }
  }

  return {
    accuracy: Math.round((correctCount / TOTAL_REELS) * 100),
    completedCount
  };
}

export function normalizeFinishedAt(state: ClientState): number | null {
  return typeof state.finishedAt === "number" ? state.finishedAt : null;
}

export function compareFinishedAtAsc(stateA: ClientState, stateB: ClientState): number {
  const finishedAtA = normalizeFinishedAt(stateA);
  const finishedAtB = normalizeFinishedAt(stateB);

  if (finishedAtA === null && finishedAtB === null) {
    return 0;
  }
  if (finishedAtA === null) {
    return 1;
  }
  if (finishedAtB === null) {
    return -1;
  }
  return finishedAtA - finishedAtB;
}

export function sortClientEntries(clients: Record<string, ClientState>): RankedClientEntry[] {
  const sorted = Object.entries(clients)
    .map(([socketId, state]) => ({ socketId, state }))
    .sort((a, b) => {
      const progressA = progressFromState(a.state);
      const progressB = progressFromState(b.state);

      if (progressA.accuracy !== progressB.accuracy) {
        return progressB.accuracy - progressA.accuracy;
      }

      if (progressA.completedCount !== progressB.completedCount) {
        return progressB.completedCount - progressA.completedCount;
      }

      const finishedAtDiff = compareFinishedAtAsc(a.state, b.state);
      if (finishedAtDiff !== 0) {
        return finishedAtDiff;
      }

      const nameDiff = a.state.name.localeCompare(b.state.name, "zh-Hant");
      if (nameDiff !== 0) {
        return nameDiff;
      }

      return a.socketId.localeCompare(b.socketId);
    });

  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1
  }));
}

export function getRankSummary(clients: Record<string, ClientState>, socketId: string | undefined): RankSummary {
  const rankedEntries = sortClientEntries(clients);
  if (!socketId) {
    return {
      rank: null,
      total: rankedEntries.length
    };
  }

  const entry = rankedEntries.find((item) => item.socketId === socketId);
  return {
    rank: entry ? entry.rank : null,
    total: rankedEntries.length
  };
}

export function formatFinishedAt(value: number | null): string {
  if (typeof value !== "number") {
    return "尚未完成";
  }

  const date = new Date(value);
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${date.toLocaleString("zh-TW", { hour12: false })}.${milliseconds}`;
}
