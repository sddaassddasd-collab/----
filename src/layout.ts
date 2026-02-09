export const MAX_COLS = 6;
export const MAX_ROWS = 5;
export const PAGE_SIZE = MAX_COLS * MAX_ROWS;

export interface GridChoice {
  rows: number;
  cols: number;
}

export function paginatePlayerIds(playerIds: string[], page: number): string[] {
  const safePage = Math.max(0, page);
  const start = safePage * PAGE_SIZE;
  return playerIds.slice(start, start + PAGE_SIZE);
}

export function chooseGrid(count: number, viewportAspect = 16 / 9): GridChoice {
  if (count <= 0) {
    return { rows: 1, cols: 1 };
  }

  let bestRows = 1;
  let bestCols = 1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let cols = 1; cols <= MAX_COLS; cols += 1) {
    const rows = Math.ceil(count / cols);
    if (rows > MAX_ROWS) {
      continue;
    }

    const empty = rows * cols - count;
    const aspectDiff = Math.abs(cols / rows - viewportAspect);
    const score = empty * 100 + aspectDiff;

    if (score < bestScore) {
      bestScore = score;
      bestRows = rows;
      bestCols = cols;
    }
  }

  return { rows: bestRows, cols: bestCols };
}
