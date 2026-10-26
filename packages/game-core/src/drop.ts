/**
 * 掉落式消消乐 —— 内核
 *
 * 为什么要这个玩法：
 *   标准三消的问题是「棋盘是系统生成的，你只是挑能得到的位置交换」。
 *   你不对局面负责，所以也不会有「我布了个局」的爽感。
 *
 * 这个玩法反过来：**棋盘是你一块一块堆出来的**。
 *   · 每组 3 个牌从顶上掉下来，你选择放在哪一列
 *   · 放下去 → 检查三连 → 消掉 → 上方的牌砸下来 → 可能触发连锁 → 可能再来一次
 *   · 堆到顶 → 死
 *
 * 于是每个决策都有代价：这一组放这里能消，但会堵住旁边那列。
 * 这才是「有意义的操作」，而不是「看到能消的就点」。
 */

import type { VillainType } from './types.ts';

// ---------------------------------------------------------------- 类型
export interface DropTile {
  type: VillainType;
  id: number;
}

export interface FallingGroup {
  /** 最左那一列的列号 */
  col: number;
  /** 当前占的行（最上面那一行） */
  row: number;
  tiles: DropTile[];
}

export interface DropState {
  cols: number;
  rows: number;
  board: Array<Array<DropTile | null>>;
  /** 正在下落的组（null = 需要生成新的） */
  falling: FallingGroup | null;
  /** 下一组的颜色预告 */
  nextTypes: VillainType[];
  /** 本轮要凑几种颜色 */
  types: VillainType[];
  status: 'playing' | 'won' | 'lost';
  score: number;
  /** 已消除总数 */
  cleared: number;
  /** 目标消除数 */
  target: number;
  /** 最近一次消除的连锁层数（UI 用） */
  lastChain: number;
  /** 最近一次消除事件的坐标（UI 播特效） */
  lastClearedCells: Array<{ row: number; col: number; type: VillainType }>;
  endReason: string | null;
  seed: number;
}

export interface DropResult {
  ok: boolean;
  reason?: 'blocked' | 'settled' | 'not_playing';
  /** 这次落地是否触发了消除 */
  cleared?: number;
  /** 连锁层数 */
  chain?: number;
  /** 是否溢出（顶到了） */
  overflow?: boolean;
}

// ---------------------------------------------------------------- 随机
function makeRng(seed: number) {
  let s = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    pick<T>(items: readonly T[]): T {
      return items[Math.min(items.length - 1, Math.floor(next() * items.length))] as T;
    },
  };
}

let tileId = 1;
const GROUP_SIZE = 1;

// ---------------------------------------------------------------- 生成
export interface DropConfig {
  cols: number;
  rows: number;
  types: VillainType[];
  target: number;
}

/**
 * 生成一组新牌。
 *
 * 关键设计：**一组 3 个牌里至少 2 个同色**。
 * 为什么？如果 3 个全不同色，玩家几乎不可能用它凑出三连，
 * 每一组都是「垃圾」，那这个游戏就变成了纯运气。
 * 给 2 个同色，玩家至少有一次「凑对」的机会，才有规划空间。
 */
function makeGroup(types: VillainType[], rng: ReturnType<typeof makeRng>): VillainType[] {
  // 单牌掉落：一次只落一个，玩家可以精确控制它落在哪一列
  return [rng.pick(types)];
}

export function createDropGame(config: DropConfig, seed = Date.now() % 100000): DropState {
  const rng = makeRng(seed);
  const board: Array<Array<DropTile | null>> = Array.from({ length: config.rows }, () =>
    Array<DropTile | null>(config.cols).fill(null),
  );

  /**
   * 开局预填底部 3 行。
   *
   * 这里有个关键设计：**预填要故意制造「对子」**（两个同色相邻）。
   * 原因：落下来的组是 [A, A, B]，横向只有 2 个 A。
   * 如果底部没有现成的 A 可对齐，那这 2 个 A 永远凑不成三个，
   * 玩家怎么放都不对，游戏 10 步就堆满了 —— 这就是初版的致命 bug。
   *
   * 制造对子之后，玩家就能「把 AA 放在已有 A 旁边」凑成三连，策略才成立。
   */
  const prefillRows = 3;
  for (let i = 0; i < prefillRows; i += 1) {
    const r = config.rows - 1 - i;
    const row: Array<VillainType> = [];

    // 先随机铺满这一行
    for (let c = 0; c < config.cols; c += 1) {
      row.push(rng.pick(config.types));
    }

    // 再随机挑 3 处，把「右边那个」改成和左边同色，形成对子
    // 对子是这个玩法唯一的「目标提示」：玩家看到 AA，就知道该补 A
    for (let k = 0; k < 3; k += 1) {
      const pairAt = Math.floor(rng.pick([1, 2, 3, 4, 5])); // 0..cols-2 的起始位置
      const start = Math.min(pairAt, config.cols - 2);
      const type = rng.pick(config.types);
      row[start] = type;
      row[start + 1] = type;
    }

    // 避免整行 3 个同色（开局就自动消除）
    for (let c = 0; c + 2 < config.cols; c += 1) {
      if (row[c] === row[c + 1] && row[c + 1] === row[c + 2]) {
        row[c + 2] = config.types.find((t) => t !== row[c]) ?? config.types[0]!;
      }
    }

    for (let c = 0; c < config.cols; c += 1) {
      if (board[r]) board[r]![c] = { type: row[c]!, id: tileId++ };
    }
  }

  const nextTypes = makeGroup(config.types, rng);
  const falling: FallingGroup = {
    col: Math.floor((config.cols - GROUP_SIZE) / 2),
    row: 0,
    tiles: nextTypes.map((type) => ({ type, id: tileId++ })),
  };

  return {
    cols: config.cols,
    rows: config.rows,
    board,
    falling,
    nextTypes: makeGroup(config.types, rng),
    types: config.types,
    status: 'playing',
    score: 0,
    cleared: 0,
    target: config.target,
    lastChain: 0,
    lastClearedCells: [],
    endReason: null,
    seed,
  };
}

// ---------------------------------------------------------------- 移动
/**
 * 左右移动。
 *
 * 返回 ok=false 表示撞到边界或别的牌，此时不动（不惩罚）。
 */
export function moveGroup(state: DropState, dir: -1 | 1): { state: DropState; ok: boolean } {
  if (state.status !== 'playing' || !state.falling) return { state, ok: false };

  const next = state.falling.col + dir;
  if (next < 0 || next + GROUP_SIZE > state.cols) return { state, ok: false };

  // 目标位置是否有牌挡着
  const blocked = state.falling.tiles.some((_, i) => {
    const c = next + i;
    const r = state.falling!.row;
    return state.board[r]?.[c] != null;
  });
  if (blocked) return { state, ok: false };

  return { state: { ...state, falling: { ...state.falling, col: next } }, ok: true };
}

/** 检测当前组能否再往下落一格 */
function canDrop(state: DropState): boolean {
  const f = state.falling;
  if (!f) return false;
  const nextRow = f.row + 1;
  if (nextRow >= state.rows) return false;
  return !f.tiles.some((_, i) => state.board[nextRow]?.[f.col + i] != null);
}

/**
 * 下落一格。落到不能再落时自动结算。
 */
export function tickDrop(state: DropState): { state: DropState; result: DropResult } {
  if (state.status !== 'playing' || !state.falling) {
    return { state, result: { ok: false, reason: 'not_playing' } };
  }

  if (canDrop(state)) {
    return {
      state: { ...state, falling: { ...state.falling, row: state.falling.row + 1 } },
      result: { ok: false, reason: 'blocked' },
    };
  }

  return settle(state);
}

/** 直接落到底 */
export function hardDrop(state: DropState): { state: DropState; result: DropResult } {
  if (state.status !== 'playing' || !state.falling) {
    return { state, result: { ok: false, reason: 'not_playing' } };
  }
  let s = state;
  let guard = 0;
  while (canDrop(s) && guard < 40) {
    s = { ...s, falling: { ...s.falling!, row: s.falling!.row + 1 } };
    guard += 1;
  }
  return settle(s);
}

// ---------------------------------------------------------------- 结算
/**
 * 落地结算：写入 → 消除 → 重力 → 再消除 → …… → 生成下一组
 */
function settle(state: DropState): { state: DropState; result: DropResult } {
  const f = state.falling;
  if (!f) return { state, result: { ok: false, reason: 'settled' } };

  // 0) 先检查：下落组当前位置是否已经被占（堆到顶的情况）
  //    不检查的话会直接覆盖已有的牌，看起来像「凭空消失」
  const overlap = f.tiles.some((_, i) => state.board[f.row]?.[f.col + i] != null);
  if (overlap) {
    return {
      state: {
        ...state,
        status: 'lost',
        endReason: '堆到顶了，没位置放了',
        falling: null,
      },
      result: { ok: false, overflow: true },
    };
  }

  // 1) 写入棋盘
  const board = state.board.map((row) => [...row]);
  f.tiles.forEach((tile, i) => {
    const r = f.row;
    const c = f.col + i;
    if (board[r]) board[r]![c] = tile;
  });

  // 2) 循环消除 + 重力
  let score = state.score;
  let cleared = state.cleared;
  let chain = 0;
  let lastCells: DropState['lastClearedCells'] = [];
  let guard = 0;

  while (guard < 20) {
    guard += 1;
    const matches = findDropMatches(board, state.cols, state.rows);
    if (matches.length === 0) break;

    chain += 1;
    // 连锁倍率：1 → 1.5 → 2 → 2.5 封顶
    const mult = Math.min(2.5, 1 + (chain - 1) * 0.5);
    const points = Math.round(matches.length * 30 * mult);
    score += points;
    cleared += matches.length;
    lastCells = matches.map((m) => ({
      row: m.row,
      col: m.col,
      type: board[m.row]?.[m.col]?.type ?? 'pua',
    }));

    // 清掉
    for (const m of matches) {
      if (board[m.row]) board[m.row]![m.col] = null;
    }

    // 重力
    applyDropGravity(board, state.cols, state.rows);
  }

  // 3) 生成下一组
  const rng = makeRng(state.seed + cleared * 7919 + chain * 131);
  const nextFalling: FallingGroup = {
    col: Math.floor((state.cols - GROUP_SIZE) / 2),
    row: 0,
    tiles: state.nextTypes.map((type) => ({ type, id: tileId++ })),
  };

  // 4) 溢出检测：新组在顶部就放不下
  const overflow = nextFalling.tiles.some((_, i) => board[0]?.[nextFalling.col + i] != null);

  let status: DropState['status'] = state.status;
  let endReason: string | null = null;

  if (overflow) {
    status = 'lost';
    endReason = '堆到顶了，没位置放了';
  } else if (cleared >= state.target) {
    status = 'won';
    endReason = '目标达成';
    score += 300;
  }

  return {
    state: {
      ...state,
      board,
      falling: overflow ? null : nextFalling,
      nextTypes: makeGroup(state.types, rng),
      status,
      score,
      cleared,
      lastChain: chain,
      lastClearedCells: lastCells,
      endReason,
    },
    result: {
      ok: true,
      cleared: chain > 0 ? lastCells.length : 0,
      chain,
      overflow,
    },
  };
}

// ---------------------------------------------------------------- 棋盘算法
/** 找所有三连（横向 + 纵向），返回去重后的坐标 */
export function findDropMatches(
  board: Array<Array<DropTile | null>>,
  cols: number,
  rows: number,
): Array<{ row: number; col: number }> {
  const marked = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;

  // 横向
  for (let r = 0; r < rows; r += 1) {
    let run = 0;
    for (let c = 1; c <= cols; c += 1) {
      const prev = board[r]?.[c - 1];
      const cur = c < cols ? board[r]?.[c] : null;
      const same = prev && cur && prev.type === cur.type;
      if (!same) {
        const len = c - run;
        if (len >= 3) {
          for (let k = run; k < c; k += 1) marked.add(key(r, k));
        }
        run = c;
      }
    }
  }

  // 纵向
  for (let c = 0; c < cols; c += 1) {
    let run = 0;
    for (let r = 1; r <= rows; r += 1) {
      const prev = board[r - 1]?.[c];
      const cur = r < rows ? board[r]?.[c] : null;
      const same = prev && cur && prev.type === cur.type;
      if (!same) {
        const len = r - run;
        if (len >= 3) {
          for (let k = run; k < r; k += 1) marked.add(key(k, c));
        }
        run = r;
      }
    }
  }

  return [...marked].map((k) => {
    const [r, c] = k.split(',');
    return { row: Number(r), col: Number(c) };
  });
}

/** 重力：每列的牌往下压紧 */
export function applyDropGravity(
  board: Array<Array<DropTile | null>>,
  cols: number,
  rows: number,
): void {
  for (let c = 0; c < cols; c += 1) {
    const column: DropTile[] = [];
    for (let r = 0; r < rows; r += 1) {
      const cell = board[r]?.[c];
      if (cell) column.push(cell);
    }
    for (let r = 0; r < rows; r += 1) {
      if (board[r]) board[r]![c] = null;
    }
    for (let i = 0; i < column.length; i += 1) {
      const r = rows - 1 - i;
      if (board[r]) board[r]![c] = column[column.length - 1 - i] ?? null;
    }
  }
}

// ---------------------------------------------------------------- 辅助
/** 下落组当前占据的格子（UI 渲染用） */
export function fallingCells(state: DropState): Array<{ row: number; col: number; tile: DropTile }> {
  const f = state.falling;
  if (!f) return [];
  return f.tiles.map((tile, i) => ({ row: f.row, col: f.col + i, tile }));
}

/** 这一组落到底会停在哪一行（显示影子） */
export function ghostRow(state: DropState): number | null {
  const f = state.falling;
  if (!f) return null;
  let row = f.row;
  let guard = 0;
  while (guard < 40) {
    guard += 1;
    const next = row + 1;
    if (next >= state.rows) break;
    const blocked = f.tiles.some((_, i) => state.board[next]?.[f.col + i] != null);
    if (blocked) break;
    row = next;
  }
  return row;
}

export function dropProgress(state: DropState): { current: number; total: number; ratio: number } {
  const current = Math.min(state.target, state.cleared);
  return { current, total: state.target, ratio: state.target === 0 ? 1 : current / state.target };
}

/** 每列堆了多高（UI 显示危险程度） */
export function columnHeights(state: DropState): number[] {
  const heights: number[] = [];
  for (let c = 0; c < state.cols; c += 1) {
    let h = 0;
    for (let r = 0; r < state.rows; r += 1) {
      if (state.board[r]?.[c]) {
        h = state.rows - r;
        break;
      }
    }
    heights.push(h);
  }
  return heights;
}
