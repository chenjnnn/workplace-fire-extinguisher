/**
 * 匹配检测 —— 消消乐的判定核心
 *
 * 全部是纯函数，输入棋盘输出坐标，方便单测和复用。
 */

import type { Board, Cell, Coord, Tile, VillainType } from './types.ts';

export function inBounds(board: Board, row: number, col: number): boolean {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
  return row >= 0 && row < board.length && col >= 0 && col < (board[0]?.length ?? 0);
}

export function getCell(board: Board, row: number, col: number): Cell {
  if (!inBounds(board, row, col)) return null;
  return board[row]?.[col] ?? null;
}

export function isAdjacent(a: Coord, b: Coord): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return dr + dc === 1;
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * 找出所有能够成的「三连及以上」，返回需要消除的坐标集合。
 *
 * 注意：毒雾格（poisoned）与普通格类型相同即可匹配，
 * 但被毒雾覆盖的格子需要「再消一次」—— 这个逻辑在外层处理。
 */
export function findMatches(board: Board): Coord[] {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const marked = new Set<string>();

  const key = (r: number, c: number) => `${r},${c}`;

  // 横向
  for (let r = 0; r < rows; r += 1) {
    let runStart = 0;
    for (let c = 1; c <= cols; c += 1) {
      const prev = getCell(board, r, c - 1);
      const cur = c < cols ? getCell(board, r, c) : null;
      const same =
        prev !== null &&
        cur !== null &&
        !prev.isPot &&
        !cur.isPot &&
        !prev.covered &&
        !cur.covered &&
        prev.type === cur.type;
      if (!same) {
        const runLen = c - runStart;
        if (runLen >= 3) {
          const sample = getCell(board, r, runStart);
          if (sample) {
            for (let k = runStart; k < c; k += 1) marked.add(key(r, k));
          }
        }
        runStart = c;
      }
    }
  }

  // 纵向
  for (let c = 0; c < cols; c += 1) {
    let runStart = 0;
    for (let r = 1; r <= rows; r += 1) {
      const prev = getCell(board, r - 1, c);
      const cur = r < rows ? getCell(board, r, c) : null;
      const same =
        prev !== null &&
        cur !== null &&
        !prev.isPot &&
        !cur.isPot &&
        !prev.covered &&
        !cur.covered &&
        prev.type === cur.type;
      if (!same) {
        const runLen = r - runStart;
        if (runLen >= 3) {
          const sample = getCell(board, runStart, c);
          if (sample) {
            for (let k = runStart; k < r; k += 1) marked.add(key(k, c));
          }
        }
        runStart = r;
      }
    }
  }

  return [...marked].map((k) => {
    const [rr, cc] = k.split(',');
    return { row: Number(rr), col: Number(cc) };
  });
}

/** 把坐标集合转成按类型分组的 Map */
export function groupByType(board: Board, coords: Coord[]): Map<string, Coord[]> {
  const map = new Map<string, Coord[]>();
  for (const coord of coords) {
    const cell = getCell(board, coord.row, coord.col);
    if (!cell) continue;
    const list = map.get(cell.type);
    if (list) list.push(coord);
    else map.set(cell.type, [coord]);
  }
  return map;
}

/**
 * 交换两个格子，返回新棋盘（不修改原棋盘）。
 * 越界或空位返回 null。
 */
export function swappedBoard(board: Board, a: Coord, b: Coord): Board | null {
  const ca = getCell(board, a.row, a.col);
  const cb = getCell(board, b.row, b.col);
  if (!ca || !cb) return null;

  const next = board.map((row) => [...row]);
  const rowA = next[a.row];
  const rowB = next[b.row];
  if (!rowA || !rowB) return null;
  rowA[a.col] = cb;
  rowB[b.col] = ca;
  return next;
}

/**
 * 这一格是否「可被消除」—— 毒雾格不行，需要先解毒。
 */
export function isClearable(tile: Tile): boolean {
  return !tile.poisoned;
}

/**
 * 找一步能形成消除的交换（提示 + 死局检测共用）。
 *
 * 实现：暴力尝试所有相邻交换，看交换后是否有匹配。
 * 7×7 棋盘最多 84 次尝试，每次 O(n²)，性能完全够。
 * 优化方向（以后）：记录每个格子的潜在匹配，而不是全盘重算。
 */
/**
 * 提示：找一个「值得做」的交换。
 *
 * 之前是行优先遍历，第一个能找到匹配的就返回 ——
 * 结果提示永远在第一行，而且往往只能消三个，玩家会觉得「这提示没用」。
 *
 * 现在改成：收集所有可行解，按「能消掉多少个」排序，优先推荐消得多的。
 * 平手时选更靠棋盘中心的，避免视线总被拉到最上面。
 */
export function findHint(board: Board): { a: Coord; b: Coord } | null {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const centerR = (rows - 1) / 2;
  const centerC = (cols - 1) / 2;

  let best: { a: Coord; b: Coord; score: number; dist: number } | null = null;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const here = { row: r, col: c };
      const hereTile = getCell(board, r, c);
      // 被文件堆盖住的格子动不了，提示不能指向它
      if (!hereTile || hereTile.covered) continue;

      // 只看右边和下边，避免重复
      const candidates: Coord[] = [
        { row: r, col: c + 1 },
        { row: r + 1, col: c },
      ];

      for (const other of candidates) {
        if (!inBounds(board, other.row, other.col)) continue;
        const otherTile = getCell(board, other.row, other.col);
        if (!otherTile || otherTile.covered) continue;
        const swapped = swappedBoard(board, here, other);
        if (!swapped) continue;

        const matched = findMatches(swapped);
        if (matched.length === 0) continue;

        const dist =
          Math.abs((r + other.row) / 2 - centerR) + Math.abs((c + other.col) / 2 - centerC);

        if (
          !best ||
          matched.length > best.score ||
          (matched.length === best.score && dist < best.dist)
        ) {
          best = { a: here, b: other, score: matched.length, dist };
        }
      }
    }
  }

  return best ? { a: best.a, b: best.b } : null;
}

/** 一组匹配（同一方向、同一类型的连续 3+ 个） */
export interface MatchGroup {
  type: VillainType;
  /** 这一组有几个（3、4、5……） */
  length: number;
  cells: Coord[];
  horizontal: boolean;
}

/**
 * 找出所有匹配「组」，保留每组的长度。
 *
 * 为什么需要它：目标从「消掉 N 个」变成「完成 N 次 3 连」之后，
 * 光知道「消了哪些格子」不够，还得知道「这些格子是几连」。
 * 4 连和两个 3 连在 findMatches 里都是 4 个坐标，但目标判定完全不同。
 */
export function findMatchGroups(board: Board): MatchGroup[] {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const groups: MatchGroup[] = [];

  // 横向
  for (let r = 0; r < rows; r += 1) {
    let runStart = 0;
    for (let c = 1; c <= cols; c += 1) {
      const prev = getCell(board, r, c - 1);
      const cur = c < cols ? getCell(board, r, c) : null;
      const same =
        prev !== null && cur !== null && !prev.isPot && !cur.isPot && prev.type === cur.type;
      if (!same) {
        const len = c - runStart;
        if (len >= 3) {
          const sample = getCell(board, r, runStart);
          if (sample) {
            const cells: Coord[] = [];
            for (let k = runStart; k < c; k += 1) cells.push({ row: r, col: k });
            groups.push({ type: sample.type, length: len, cells, horizontal: true });
          }
        }
        runStart = c;
      }
    }
  }

  // 纵向
  for (let c = 0; c < cols; c += 1) {
    let runStart = 0;
    for (let r = 1; r <= rows; r += 1) {
      const prev = getCell(board, r - 1, c);
      const cur = r < rows ? getCell(board, r, c) : null;
      const same =
        prev !== null && cur !== null && !prev.isPot && !cur.isPot && prev.type === cur.type;
      if (!same) {
        const len = r - runStart;
        if (len >= 3) {
          const sample = getCell(board, runStart, c);
          if (sample) {
            const cells: Coord[] = [];
            for (let k = runStart; k < r; k += 1) cells.push({ row: k, col: c });
            groups.push({ type: sample.type, length: len, cells, horizontal: false });
          }
        }
        runStart = r;
      }
    }
  }

  return groups;
}

/**
 * 下落：把每个非空格子压到列底，返回新棋盘 + 每列新生成的空格数。
 *
 * 这个函数只处理「重力」，不负责生成新格子（由 game.ts 用带种子随机的池子填）。
 */
export function applyGravity(
  board: Board,
  covers?: boolean[][],
): { board: Board; spawnedPerCol: number[] } {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const next: Board = Array.from({ length: rows }, () => Array<Cell>(cols).fill(null));
  const spawnedPerCol: number[] = Array(cols).fill(0);

  for (let c = 0; c < cols; c += 1) {
    /**
     * 文件堆是「固定障碍」：它不下落，而且会挡住上面的块。
     *
     * 所以一列被文件堆切成若干段，每一段各自向自己的底部压实：
     *   · 文件堆下方的块留在下方（不会穿过文件堆往上跑）
     *   · 文件堆上方的块最多落到「文件堆上一格」为止
     * 没有文件堆时，整列就是一段，行为和原来完全一样。
     */
    let segmentBottom = rows - 1;

    for (let r = rows - 1; r >= 0; r -= 1) {
      if (covers?.[r]?.[c]) {
        // 遇到文件堆：它自己占住这一格，下面的领导原样保留（被压着，不动）
        next[r]![c] = getCell(board, r, c);
        // 上方的「落点」抬到它上面一格 —— 块落到文件堆上就停
        segmentBottom = r - 1;
        continue;
      }

      const cell = getCell(board, r, c);
      if (!cell) continue;

      // 落到当前段的最低空位
      next[segmentBottom]![c] = cell;
      segmentBottom -= 1;
    }

    // 每一段的顶部空位记为「需要补新块」
    let empties = 0;
    for (let r = 0; r < rows; r += 1) {
      if (covers?.[r]?.[c]) continue;
      if (!next[r]![c]) empties += 1;
    }
    spawnedPerCol[c] = empties;
  }

  return { board: next, spawnedPerCol };
}

/** 统计棋盘上每种类型的数量 */
export function countByType(board: Board): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      map.set(cell.type, (map.get(cell.type) ?? 0) + 1);
    }
  }
  return map;
}

/** 棋盘是否已满（没有空位） */
export function isFull(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell !== null));
}
