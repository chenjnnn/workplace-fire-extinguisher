/**
 * 游戏主逻辑 —— 状态机 + 连锁结算
 *
 * 这个文件是整个游戏的心脏，全部是纯逻辑：
 *   · 没有 DOM、没有 canvas、没有 setTimeout
 *   · 每次操作返回「新状态 + 需要播放的事件」
 *   · 时间推进（动画多久结束）由渲染层驱动，核心只关心「结算完了没有」
 *
 * 这样做的好处：同一份代码能在网页和小程序里跑，且可以完整单测。
 */

import { createRng, seedFromDate, seedFromTimestamp, type Rng } from './rng.ts';
import {
  applyGravity,
  findHint,
  findMatchGroups,
  findMatches,
  getCell,
  groupByType,
  inBounds,
  isAdjacent,
  isFull,
  sameCoord,
  swappedBoard,
} from './match.ts';
import { addCrime, crimeMultiplier } from './crimes.ts';
import {
  describeEffect,
  drawQuiz,
  getTool,
  isOptionRight,
  type Quiz,
  type QuizContext,
} from './quiz.ts';
import type {
  Board,
  Cell,
  ComboEvent,
  Coord,
  GameMode,
  GameState,
  LevelConfig,
  RescueTarget,
  SwapResult,
  Tile,
  VillainType,
} from './types.ts';
import { MODE_CONFIGS, VILLAINS } from './types.ts';
import { randomAvatar, makeRescueAvatar } from './avatar.ts';
import { getLevel } from './levels.ts';

// ---------------------------------------------------------------- 文案
/** 连锁层数对应的文案 —— 这是消除游戏最廉价的爽点 */
export const COMBO_LABELS = ['', '一窝端', '连锅端', '跨省追捕', '天网恢恢', '法网难逃', '无处可逃'];

export function comboLabel(chain: number): string {
  if (chain <= 0) return '';
  return COMBO_LABELS[Math.min(chain, COMBO_LABELS.length - 1)] ?? '一窝端';
}

/** 倍数：连锁越深分越高，封顶 4 倍避免分数爆炸 */
export function chainMultiplier(chain: number, cap = 2.6): number {
  // 封顶默认 2.6：实测 4 倍会让大串联直接刷爆分数，星级失去意义。
  // 解恨模式放开到 4 倍——那个模式的目的就是「爽」，不需要严谨的经济系统。
  return Math.min(cap, 1 + (chain - 1) * 0.4);
}

// ---------------------------------------------------------------- 初始化
let nextTileId = 1;

function resetTileIds(startAt = 1): void {
  nextTileId = startAt;
}

function makeTile(
  type: VillainType,
  row: number,
  col: number,
  poisoned = false,
  variant = 0,
): Tile {
  const def = VILLAINS[type];
  return {
    id: nextTileId++,
    type,
    variant: variant % 3,
    hp: def.hp,
    poisoned,
    state: 'idle',
    viewRow: row,
    viewCol: col,
    scale: 1,
    rotation: 0,
    alpha: 1,
  };
}

/**
 * 生成一个「开局没有三连」的棋盘。
 *
 * 为什么要排除三连：开局就自动消除会让玩家困惑「我还没动呢」，
 * 而且白送分数，破坏难度曲线。
 */
function generateBoard(level: LevelConfig, rng: Rng): Board {
  const { rows, cols, types } = level;
  const board: Board = Array.from({ length: rows }, () => Array<Cell>(cols).fill(null));

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      // 最多尝试有限次，避免极端情况下死循环
      let chosen: VillainType | null = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const candidate = rng.pick(types);
        // 检查左边两个是否同类型
        const left1 = c >= 1 ? getCell(board, r, c - 1) : null;
        const left2 = c >= 2 ? getCell(board, r, c - 2) : null;
        if (left1 && left2 && left1.type === candidate && left2.type === candidate) continue;
        // 检查上边两个
        const up1 = r >= 1 ? getCell(board, r - 1, c) : null;
        const up2 = r >= 2 ? getCell(board, r - 2, c) : null;
        if (up1 && up2 && up1.type === candidate && up2.type === candidate) continue;
        chosen = candidate;
        break;
      }
      // 兜底：直接用第一个类型（极端情况才会走到）
      if (!chosen) chosen = types[0] ?? 'pua';
      // 每张牌随机一个视觉变体（只影响长相，不影响匹配）
      board[r]![c] = makeTile(chosen, r, c, false, rng.int(3));
    }
  }

  return board;
}

/** 生成初始状态 */
export function createGame(levelId: number, seed?: number, mode: GameMode = 'normal'): GameState {
  const level = getLevel(levelId);
  const actualSeed = seed ?? seedFromTimestamp(Date.now());
  resetTileIds(Math.floor(actualSeed % 100000) * 1000 + 1);
  const rng = createRng(actualSeed);
  const modeConfig = MODE_CONFIGS[mode];

  let board = generateBoard(level, rng);

  // 极端情况：生成出来的棋盘无解，重排
  let attempts = 0;
  while (!findHint(board) && attempts < 10) {
    board = generateBoard(level, rng);
    attempts += 1;
  }

  const clearedCount = emptyCount();

  // 初始化待救援者
  const rescues: RescueTarget[] = (level.rescues ?? []).map((r, idx) => ({
    id: `rescue_${idx}`,
    name: r.name,
    situation: r.situation,
    type: r.type,
    needed: r.needed,
    progress: 0,
    danger: 0,
    dangerSeconds: r.dangerSeconds,
    status: 'active' as const,
    avatar: makeRescueAvatar(levelId * 10 + idx),
  }));

  /**
   * 开局撒 6~10 个「文件堆」。
   *
   * 规则（用户定的）：
   *   · 被盖住的领导不能交换、不能被消除、不计入囚车
   *   · 文件堆不下落，是固定障碍；上方块落到它上方就停
   *   · 只能靠「相邻消除」或道具清掉
   *   · 绝不盖在空格上（下面必须有领导）
   */
  const coverSpots = pickCoverSpots(board, rng);
  for (const { row, col } of coverSpots) {
    const t = board[row]?.[col];
    if (t) board[row]![col] = { ...t, covered: true };
  }

  const state: GameState = {
    level,
    board,
    phase: 'idle',
    score: 0,
    movesLeft: level.moves,
    rage: 0,
    rageMax: 100,
    mode,
    modeConfig,
    rescues,
    pendingQuiz: null,
    quizzesTaken: 0,
    crimeBook: {},
    matchStats: {},
    // 文件堆：格子级障碍（pickCoverSpots 已经挑好位置）
    covers: Array.from({ length: level.rows }, (_, r) =>
      Array.from({ length: level.cols }, (_, c) =>
        coverSpots.some((spot) => spot.row === r && spot.col === c),
      ),
    ),
    rescuedCount: 0,
    lostCount: 0,
    rescuePenalty: 0,
    clearedCount,
    chain: 0,
    maxChain: 0,
    events: [],
    totalCleared: 0,
    hint: null,
    reshuffles: 0,
    seed: actualSeed,
    sweepUsed: 0,
  };

  return state;
}

function emptyCount(): Record<VillainType, number> {
  return {
    pua: 0,
    shirk: 0,
    grafter: 0,
    overtime: 0,
    formalist: 0,
  };
}

/** 每日挑战：同一个日期全球同一副棋盘 */
export function createDailyGame(date: Date, levelId = 3, mode: GameMode = 'normal'): GameState {
  return createGame(levelId, seedFromDate(date), mode);
}

// ---------------------------------------------------------------- 救援
/**
 * 推进救援倒计时（引擎每帧调用）。
 *
 * 设计要点（这决定了游戏是「紧张」还是「劝退」）：
 *   · 只有 active 状态的救援目标在倒计时
 *   · 每消除一个对应类型的坏人，危险值回退 12%（约等于给玩家 1.8 秒缓冲）
 *   · 危险值涨满 = 救援失败 = 扣评价，**不结束游戏**
 *
 * 为什么不做成「倒计时归零就 game over」：
 *   10 秒内没完成就判负，玩家只会觉得游戏在跟自己作对。
 *   我们要的是「有压力」，不是「被针对」。
 */
export function advanceRescue(state: GameState, dtSeconds: number): GameState {
  if (state.phase !== 'idle' && state.phase !== 'resolving') return state;
  if (state.rescues.length === 0) return state;

  const rate = state.modeConfig.dangerRate;
  let changed = false;

  const rescues = state.rescues.map((r) => {
    if (r.status !== 'active') return r;

    const nextDanger = Math.min(1, r.danger + (dtSeconds / Math.max(1, r.dangerSeconds)) * rate);
    if (nextDanger === r.danger) return r;
    changed = true;

    if (nextDanger >= 1) {
      // 失败：扣评价，但游戏继续
      return { ...r, danger: 1, status: 'lost' as const };
    }
    return { ...r, danger: nextDanger };
  });

  if (!changed) return state;

  let rescuedCount = state.rescuedCount;
  let lostCount = state.lostCount;
  let rescuePenalty = state.rescuePenalty;
  for (const r of rescues) {
    const before = state.rescues.find((x) => x.id === r.id);
    if (before?.status === 'active' && r.status === 'lost') {
      lostCount += 1;
      if (state.modeConfig.penaltyOnRescueFail) rescuePenalty += 1;
    }
  }

  return { ...state, rescues, rescuedCount, lostCount, rescuePenalty };
}

/** 把消除结果反馈到救援进度上 */
function feedRescue(state: GameState, counts: Partial<Record<VillainType, number>>): GameState {
  if (state.rescues.length === 0) return state;

  let rescuedCount = state.rescuedCount;
  let changed = false;

  const rescues = state.rescues.map((r) => {
    if (r.status !== 'active') return r;

    const cleared = counts[r.type] ?? 0;
    if (cleared <= 0) return r;

    changed = true;
    // 进度推进
    const progress = Math.min(r.needed, r.progress + cleared);
    // 危险值回退：每消一个给 12% 缓冲
    const danger = Math.max(0, r.danger - cleared * 0.12);

    if (progress >= r.needed) {
      rescuedCount += 1;
      return { ...r, progress, danger: 0, status: 'rescued' as const };
    }
    return { ...r, progress, danger };
  });

  if (!changed) return state;
  return { ...state, rescues, rescuedCount };
}

// ---------------------------------------------------------------- 尝试交换
/**
 * 玩家拖拽/点击两个相邻格子。
 *
 * 返回：
 *   ok=false  → 不是合法交换（不扣步数），渲染层播放「抖动」提示
 *   ok=true   → 棋盘已交换，进入 resolving，渲染层去播动画
 */
export function trySwap(state: GameState, a: Coord, b: Coord): { state: GameState; result: SwapResult } {
  // 锅块是障碍，不能交换
  if (getCell(state.board, a.row, a.col)?.isPot || getCell(state.board, b.row, b.col)?.isPot) {
    return { state, result: { ok: false, reason: 'blocked' } };
  }
  // 被文件堆盖住的格子要先翻开
  if (getCell(state.board, a.row, a.col)?.covered || getCell(state.board, b.row, b.col)?.covered) {
    return { state, result: { ok: false, reason: 'blocked' } };
  }
  if (state.phase !== 'idle') {
    return { state, result: { ok: false, reason: 'busy' } };
  }
  if (sameCoord(a, b)) {
    return { state, result: { ok: false, reason: 'same_cell' } };
  }
  if (!inBounds(state.board, a.row, a.col) || !inBounds(state.board, b.row, b.col)) {
    return { state, result: { ok: false, reason: 'out_of_bounds' } };
  }
  if (!isAdjacent(a, b)) {
    return { state, result: { ok: false, reason: 'not_adjacent' } };
  }

  const swapped = swappedBoard(state.board, a, b);
  if (!swapped) {
    return { state, result: { ok: false, reason: 'no_match' } };
  }

  if (findMatches(swapped).length === 0) {
    return { state, result: { ok: false, reason: 'no_match' } };
  }

  // 交换后的两个格子位置也要同步（渲染层靠 viewRow/viewCol 插值）
  const tileA = getCell(swapped, a.row, a.col);
  const tileB = getCell(swapped, b.row, b.col);
  if (tileA) {
    tileA.viewRow = a.row;
    tileA.viewCol = a.col;
  }
  if (tileB) {
    tileB.viewRow = b.row;
    tileB.viewCol = b.col;
  }

  const next: GameState = {
    ...state,
    board: swapped,
    phase: 'resolving',
    movesLeft: state.movesLeft - 1,
    hint: null,
    chain: 0,
  };

  return { state: next, result: { ok: true } };
}

// ---------------------------------------------------------------- 结算一步
/** 消除一组的产物 */
interface ClearOutcome {
  board: Board;
  cleared: Coord[];
  events: ComboEvent[];
  score: number;
  rage: number;
  counts: Partial<Record<VillainType, number>>;
  overtimePenalty: number;
  poisonCells: Coord[];
}

/**
 * 处理一次「消除」：扣除血量、触发特殊机制、从棋盘移除。
 *
 * 特殊机制都在这里，是各类型坏人「不一样」的地方。
 */
function clearMatches(
  board: Board,
  matches: Coord[],
  chain: number,
  move: number,
  chainCap = 2.6,
): ClearOutcome {
  const next = board.map((row) => [...row]);
  const events: ComboEvent[] = [];
  const cleared: Coord[] = [];
  const poisonCells: Coord[] = [];
  const counts: Partial<Record<VillainType, number>> = {};
  let score = 0;
  let rage = 0;
  let overtimePenalty = 0;

  const groups = groupByType(board, matches);

  for (const [typeKey, coords] of groups) {
    const type = typeKey as VillainType;
    const def = VILLAINS[type];
    const actuallyCleared: Coord[] = [];

    for (const coord of coords) {
      const cell = getCell(next, coord.row, coord.col);
      if (!cell) continue;

      // 毒雾格：不消除，只解毒（需要再消一次）
      if (cell.poisoned) {
        next[coord.row]![coord.col] = { ...cell, poisoned: false };
        cleared.push(coord);
        continue;
      }

      // 贪官有两条命：第一次只掉血
      if (cell.hp > 1) {
        next[coord.row]![coord.col] = {
          ...cell,
          hp: cell.hp - 1,
          state: 'idle',
          scale: 0.86,
        };
        // 掉血也算「碰到」，给一点分
        score += Math.round(def.baseScore * 0.4);
        continue;
      }

      // 恶霸反击：只扣分，不扣步。
      // 历史教训：早期版本「每个恶霸扣 1 步」，长串联会一次掉十几步，
      // 玩家完全无法预判，输得莫名其妙。改成扣分后规则简单透明：步数只按操作的步走。
      if (type === 'overtime') {
        overtimePenalty += 0.2;
      }

      // 保护伞：十字爆裂（上下左右 2 格）
      // 注意：早期实现是「清空整列」，但它会自我放大 ——
      // 清一列可能带出更多伞，更多伞又清更多列，实测平均清掉 176 格（棋盘才 64 格）。
      // 改成固定半径后强度可控，也更容易让玩家预测。
      if (type === 'formalist') {
        const blast = [
          { row: coord.row - 1, col: coord.col },
          { row: coord.row + 1, col: coord.col },
          { row: coord.row, col: coord.col - 1 },
          { row: coord.row, col: coord.col + 1 },
          { row: coord.row - 2, col: coord.col },
          { row: coord.row + 2, col: coord.col },
          { row: coord.row, col: coord.col - 2 },
          { row: coord.row, col: coord.col + 2 },
        ];
        for (const b of blast) {
          if (!inBounds(next, b.row, b.col)) continue;
          const target = getCell(next, b.row, b.col);
          if (!target || target.poisoned) continue;
          next[b.row]![b.col] = null;
          actuallyCleared.push(b);
        }
      }

      // 毒贩：污染相邻格
      if (type === 'shirk') {
        const neighbors: Coord[] = [
          { row: coord.row - 1, col: coord.col },
          { row: coord.row + 1, col: coord.col },
          { row: coord.row, col: coord.col - 1 },
          { row: coord.row, col: coord.col + 1 },
        ];
        for (const n of neighbors) {
          if (!inBounds(next, n.row, n.col)) continue;
          const neighborCell = getCell(next, n.row, n.col);
          if (neighborCell && !neighborCell.poisoned) {
            next[n.row]![n.col] = { ...neighborCell, poisoned: true };
            poisonCells.push(n);
          }
        }
      }

      // 标记消除（先置 state，让渲染层播动画）
      next[coord.row]![coord.col] = { ...cell, state: 'clearing' };
      actuallyCleared.push(coord);
    }

    if (actuallyCleared.length === 0) continue;

    const groupScore = Math.round(
      def.baseScore * actuallyCleared.length * chainMultiplier(chain, chainCap),
    );

    score += groupScore;
    rage += def.rage * actuallyCleared.length;
    counts[type] = (counts[type] ?? 0) + actuallyCleared.length;

    events.push({
      chain,
      cleared: actuallyCleared.length,
      points: groupScore,
      label: comboLabel(chain),
      cells: actuallyCleared,
      type,
      move,
      kind: 'clear',
    });

    cleared.push(...actuallyCleared);
  }

  return { board: next, cleared, events, score, rage, counts, overtimePenalty, poisonCells };
}

/** 从棋盘移除被标记消除的格子 */
function removeCleared(board: Board, cleared: Coord[]): Board {
  const next = board.map((row) => [...row]);
  for (const coord of cleared) {
    const cell = getCell(next, coord.row, coord.col);
    if (cell && cell.state === 'clearing') {
      next[coord.row]![coord.col] = null;
    }
  }
  return next;
}

/**
 * 填充新格子（从上方掉落）。
 *
 * 关键：新格子的 viewRow 是负数，渲染层据此播「从上掉下来」的动画。
 */
function refillBoard(board: Board, level: LevelConfig, rng: Rng, covers?: boolean[][]): Board {
  const next = board.map((row) => [...row]);
  const rows = next.length;
  const cols = next[0]?.length ?? 0;

  for (let c = 0; c < cols; c += 1) {
    // 统计每一段（被文件堆切开）的空位，只在这一段的顶部上方生成新块
    let segStart = 0;
    const segments: Array<[number, number]> = [];
    for (let r = 0; r <= rows; r += 1) {
      const isCover = r < rows && covers?.[r]?.[c];
      if (r === rows || isCover) {
        segments.push([segStart, r - 1]);
        segStart = r + 1;
      }
    }

    for (const [idx, seg] of segments.entries()) {
      const [top, bottom] = seg;
      if (bottom < top) continue;
      let holes = 0;
      for (let r = top; r <= bottom; r += 1) {
        if (!next[r]![c]) holes += 1;
      }
      if (holes === 0) continue;

      for (let i = 0; i < holes; i += 1) {
        const type = rng.pick(level.types);
        // 只有最上面那一段的块是从棋盘上方掉进来的；
        // 文件堆下方的段直接在原地生成（它们被文件堆压着，不该有掉落动画）
        const fromAbove = idx === 0;
        const tile = makeTile(type, fromAbove ? top - 1 - i : top + i, c, false, rng.int(3));
        tile.state = fromAbove ? 'spawning' : 'idle';
        if (fromAbove) tile.dropFromRow = top - 1 - i;
        for (let r = top; r <= bottom; r += 1) {
          if (!next[r]![c]) {
            next[r]![c] = tile;
            break;
          }
        }
      }
    }
  }

  void applyGravity; // 说明：重力在 resolveStep 里调用，这里只负责往顶部填空

  return next;
}

export interface StepResult {
  state: GameState;
  /** 本步是否形成了有效消除 */
  hadMatch: boolean;
  /** 是否触发了重排（死局） */
  reshuffled: boolean;
}

/**
 * 结算一整步：连锁消除 → 重力 → 填充 → 再检测，直到无可消除。
 *
 * 这个函数是同步的：它会把整条连锁全部算完，
 * 渲染层则根据 events 逐条播放（每条 event 有 chain 序号可用来做节拍）。
 */
export function resolveStep(state: GameState, rng: Rng): StepResult {
  let board = state.board;
  let score = state.score;
  let rage = state.rage;
  let movesLeft = state.movesLeft;
  let chain = 0;
  let maxChain = state.maxChain;
  const events: ComboEvent[] = [];
  const clearedCount = { ...state.clearedCount };
  const matchStats: Record<string, number> = { ...state.matchStats };
  // 文件堆在这一手里可能被相邻消除清掉，用副本边走边改
  const coversForBoard: boolean[][] = state.covers.map((row) => [...row]);
  let totalCleared = 0;
  let rescueState = state;
  let hadMatch = false;
  const move = state.level.moves - state.movesLeft + 1;

  // 锅老化：没消掉就多撑一步，3 步后自动解冻（防死局）
  state = tickPots(state);

  // 保险：连锁最多 30 层，防止逻辑 bug 导致死循环
  const MAX_CHAIN = 30;

  for (let i = 0; i < MAX_CHAIN; i += 1) {
    const matches = findMatches(board);
    if (matches.length === 0) break;

    hadMatch = true;
    chain += 1;
    maxChain = Math.max(maxChain, chain);

    /**
     * 连坐：被消除格子的上下左右如果有「同种领导」，它会甩锅给你 ——
     * 那一格不消失，而是变成灰色的「锅」。
     *
     * 这是给消除加「机会成本」的核心机制：
     * 以前消掉同类集群只有好处，现在从集群中间下手会留下锅。
     */
    // 记录连击：这一波里每组多长（用于「3 连 N 次」类目标）
    const groups = findMatchGroups(board);
    for (const g of groups) {
      const key = `${g.type}:${g.length}`;
      matchStats[key] = (matchStats[key] ?? 0) + 1;
      // 「≥N 连」的累计：4 连同时算作 3 连、4 连，5 连算 3/4/5
      for (let n = 3; n <= g.length; n += 1) {
        const keyAtLeast = `${g.type}:atleast${n}`;
        matchStats[keyAtLeast] = (matchStats[keyAtLeast] ?? 0) + 1;
      }
    }

    /**
     * 文件堆清除：被消除的格子，上下左右如果压着文件堆，那一叠文件就被「顺手清掉」。
     * 这是文件堆唯一的自然清除方式（另一种是道具命中）。
     */
    for (const m of matches) {
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const cr = m.row + dr;
        const cc = m.col + dc;
        if (coversForBoard[cr]?.[cc]) {
          coversForBoard[cr]![cc] = false;
          const t = getCell(board, cr, cc);
          if (t) board[cr]![cc] = { ...t, covered: false };
        }
      }
    }

    const potTargets = findPotTargets(board, matches);

    const outcome = clearMatches(board, matches, chain, move, state.modeConfig.chainCap);
    board = outcome.board;
    score += outcome.score;
    rage += outcome.rage;
    // 恶霸反击只扣分（在 outcome.score 里已体现），不影响步数
    score -= Math.round(outcome.overtimePenalty * VILLAINS.overtime.baseScore);
    events.push(...outcome.events);
    totalCleared += outcome.cleared.length;

    for (const [type, count] of Object.entries(outcome.counts)) {
      const key = type as VillainType;
      // 罪状集齐的领导「一个算三个」，推进目标更快
      const mult = crimeMultiplier(state.crimeBook, key);
      clearedCount[key] = (clearedCount[key] ?? 0) + (count ?? 0) * mult;
    }

    // 消除结果反馈到救援进度
    rescueState = feedRescue(rescueState, outcome.counts);


    // 移除 → 落下锅 → 重力 → 填充
    board = removeCleared(board, outcome.cleared);
    board = placePots(board, potTargets);

    // 记录掉落起点：每个格子要到哪一行，以及它原来在哪一行
    const dropStarts = new Map<Tile, number>();
    for (let r = 0; r < board.length; r += 1) {
      for (let c = 0; c < (board[r]?.length ?? 0); c += 1) {
        const tile = getCell(board, r, c);
        if (tile) dropStarts.set(tile, tile.viewRow);
      }
    }

    const gravity = applyGravity(board, coversForBoard);
    board = gravity.board;
    board = refillBoard(board, state.level, rng, coversForBoard);

    // 把「起点」写回掉落后的格子（同一批对象，按引用对上）
    for (let r = 0; r < board.length; r += 1) {
      for (let c = 0; c < (board[r]?.length ?? 0); c += 1) {
        const tile = getCell(board, r, c);
        if (!tile) continue;
        const startRow = dropStarts.get(tile);
        if (startRow !== undefined) tile.dropFromRow = startRow;
      }
    }
  }

  // 同步所有格子的显示坐标（掉落动画的终点）
  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < (board[r]?.length ?? 0); c += 1) {
      const cell = getCell(board, r, c);
      if (cell) {
        cell.state = 'idle';
      }
    }
  }

  // 死局检测：没有可消除的步 → 重排
  let reshuffled = false;
  if (isFull(board) && !findHint(board)) {
    board = shuffleBoard(board, state.level, rng);
    reshuffled = true;
  }

  let next: GameState = {
    ...state,
    board,
    score,
    rage: Math.min(state.rageMax, rage),
    movesLeft,
    chain,
    maxChain,
    events,
    totalCleared: state.totalCleared + totalCleared,
    clearedCount,
    // 这个之前漏了写回 —— 连击目标不会推进
    matchStats,
    covers: coversForBoard,
    // 救援进度与失败计数从中间态合并回来
    rescues: rescueState.rescues,
    rescuedCount: rescueState.rescuedCount,
    lostCount: rescueState.lostCount,
    rescuePenalty: rescueState.rescuePenalty,
    phase: 'idle',
    reshuffles: state.reshuffles + (reshuffled ? 1 : 0),
    hint: null,
  };

  // 判定胜负
  const won = goalsMet(next);
  if (won) {
    next = { ...next, phase: 'won' };
  } else if (next.movesLeft <= 0) {
    next = { ...next, phase: 'lost' };
  }

  return { state: next, hadMatch, reshuffled };
}

// ---------------------------------------------------------------- 问答
/**
 * 每消除多少个触发一次问答。
 *
 * 从 12 调到 20：12 的时候一局大关卡会弹 5-6 次，玩家根本没法连续玩。
 * 用户的原话是「一个游戏弹出来两三次就差不多了」。
 */
export const QUIZ_EVERY = 20;

/** 每局最多弹几次问答 */
export const QUIZ_MAX_PER_GAME = 3;

/**
 * 把工具效果作用到棋盘上。
 *
 * 用户的要求是「工具对应清除一行/一列/整页」，
 * 所以这里直接改棋盘，而不是简单加分。
 */
export function applyToolToBoard(
  state: GameState,
  effect: { kind: string; amount?: number },
  rng: Rng,
): { state: GameState; cells: Coord[]; cleared: number } {
  const rows = state.board.length;
  const cols = state.board[0]?.length ?? 0;
  const board = state.board.map((row) => [...row]);
  const cells: Coord[] = [];

  const clearCell = (r: number, c: number) => {
    if (board[r]?.[c]) {
      board[r]![c] = null;
      cells.push({ row: r, col: c });
    }
  };

  if (effect.kind === 'clearRow' || effect.kind === 'clearCross') {
    // 挑「最满的那一行」，清起来最爽
    let best = 0;
    let bestCount = -1;
    for (let r = 0; r < rows; r += 1) {
      const n = board[r]!.filter(Boolean).length;
      if (n > bestCount) {
        bestCount = n;
        best = r;
      }
    }
    for (let c = 0; c < cols; c += 1) clearCell(best, c);

    if (effect.kind === 'clearCross') {
      // 十字：再清一列（选和这一行交叉点最多的列，这里取中间列）
      const mid = Math.floor(cols / 2);
      for (let r = 0; r < rows; r += 1) clearCell(r, mid);
    }
  } else if (effect.kind === 'clearCol') {
    let best = 0;
    let bestCount = -1;
    for (let c = 0; c < cols; c += 1) {
      let n = 0;
      for (let r = 0; r < rows; r += 1) if (board[r]?.[c]) n += 1;
      if (n > bestCount) {
        bestCount = n;
        best = c;
      }
    }
    for (let r = 0; r < rows; r += 1) clearCell(r, best);
  } else if (effect.kind === 'clearRandom') {
    const amount = effect.amount ?? 6;
    const all: Coord[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (board[r]?.[c]) all.push({ row: r, col: c });
      }
    }
    // 洗牌后取前 N 个
    for (let i = all.length - 1; i > 0; i -= 1) {
      const j = rng.int(i + 1);
      [all[i], all[j]] = [all[j]!, all[i]!];
    }
    for (const p of all.slice(0, amount)) clearCell(p.row, p.col);
  }

  const cleared = cells.length;
  // applyGravity 返回 { board, ... }，不是裸数组
  const gravity = applyGravity(board);
  const filled = refillBoard(gravity.board, state.level, rng);
  // 工具清出来的新牌直接落定，不播掉落动画
  for (const row of filled) {
    for (const tile of row) {
      if (tile) {
        tile.state = 'idle';
      }
    }
  }

  return {
    state: {
      ...state,
      board: filled,
      score: state.score + cleared * 45,
      totalCleared: state.totalCleared + cleared,
      clearedCount: bumpCounts(state.clearedCount, cells, state),
    },
    cells,
    cleared,
  };
}

/** 统计清除的每种类型数量 */
function bumpCounts(
  counts: Record<string, number>,
  cells: Coord[],
  state: GameState,
): Record<string, number> {
  // 牌已经被清掉了，只能按位置记录；这里简化处理，不改类型统计
  void cells;
  return counts ?? state.clearedCount;
}

/**
 * 该不该弹问答了。
 *
 * 注意：**不能用「totalCleared % 12 === 0」判断**。
 * 一次消除可能加 3-10 个，会直接跳过 12、24、36 这些点，
 * 结果就是永远弹不出来（这是实际踩到的 bug）。
 *
 * 正确做法：看「跨过了几道 12 的门槛」，和已经答过的题数比较。
 */
export function shouldTriggerQuiz(state: GameState): boolean {
  if (state.pendingQuiz) return false;
  // 每局有上限，避免大关卡一直被打断
  if (state.quizzesTaken >= QUIZ_MAX_PER_GAME) return false;
  const threshold = Math.floor(state.totalCleared / QUIZ_EVERY);
  return threshold > state.quizzesTaken;
}

/** 抽出下一道题（抽过的不再出现） */
export function triggerQuiz(
  state: GameState,
  usedIds: string[],
  seed: number,
): { state: GameState; usedIds: string[] } {
  const { quiz, usedIds: nextUsed } = drawQuiz(seed, usedIds);
  return { state: { ...state, pendingQuiz: quiz }, usedIds: nextUsed };
}

/**
 * 挑出要盖文件堆的格子：6~10 个，且每格下面必须有领导。
 */
function pickCoverSpots(
  board: Board,
  rng: Rng,
): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < (board[r]?.length ?? 0); c += 1) {
      // 只考虑有领导的格子 —— 不能盖在空格上
      if (board[r]?.[c]) cells.push({ row: r, col: c });
    }
  }

  // Fisher-Yates 洗牌
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }

  const count = 6 + Math.floor(rng.next() * 5); // 6~10
  return cells.slice(0, Math.min(count, cells.length));
}

/**
 * 找出哪些格子会被「连坐」成锅。
 *
 * 规则：被消除的格子，其上下左右如果也是同种类型（且不在本次消除列表里），
 * 那它就是「被甩锅」的那个 —— 不消失，变成锅。
 */
function findPotTargets(board: Board, matches: Coord[]): Array<{ row: number; col: number }> {
  // 只在「一次消掉 4 个以上同类」时才连坐 —— 包括三连就甩锅的话，棋盘会被锅占满
  if (matches.length < 4) return [];

  const inMatch = new Set(matches.map((m) => `${m.row},${m.col}`));
  const targets: Array<{ row: number; col: number }> = [];
  const seen = new Set<string>();

  for (const m of matches) {
    const src = getCell(board, m.row, m.col);
    if (!src) continue;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const r = m.row + dr;
      const c = m.col + dc;
      const key = `${r},${c}`;
      if (inMatch.has(key) || seen.has(key)) continue;
      const tile = getCell(board, r, c);
      if (!tile || tile.isPot) continue;
      if (tile.type !== src.type) continue;
      seen.add(key);
      targets.push({ row: r, col: c });
    }
  }

  // 一次最多连坐 1 个。这是「有代价」和「不卡死」的平衡点
  return targets.slice(0, 1);
}

/** 把锅放到棋盘上（覆盖原格子） */
function placePots(board: Board, targets: Array<{ row: number; col: number }>): Board {
  if (targets.length === 0) return board;
  const next = board.map((row) => [...row]);
  for (const t of targets) {
    const tile = getCell(next, t.row, t.col);
    if (!tile) continue;
    next[t.row]![t.col] = { ...tile, isPot: true, potAge: 0 };
  }
  return next;
}

/**
 * 每走一步，锅老化一次；到 3 步就解冻变回普通块。
 *
 * 为什么必须解冻：棋盘只有 49 格，如果锅永久占位，
 * 十几步之后棋盘就死了。3 步是「有代价」和「不卡死」的平衡点。
 */
export function tickPots(state: GameState): GameState {
  let changed = false;
  const board = state.board.map((row) =>
    row.map((tile) => {
      if (!tile?.isPot) return tile;
      const age = (tile.potAge ?? 0) + 1;
      if (age >= 3) {
        changed = true;
        return { ...tile, isPot: false, potAge: undefined };
      }
      changed = true;
      return { ...tile, potAge: age };
    }),
  );
  return changed ? { ...state, board } : state;
}

/** 把当前棋盘状态整理成判定用的上下文 */
export function buildQuizContext(state: GameState): QuizContext {
  const typeCounts: QuizContext['typeCounts'] = {};
  for (const row of state.board) {
    for (const tile of row) {
      if (!tile) continue;
      typeCounts[tile.type] = (typeCounts[tile.type] ?? 0) + 1;
    }
  }

  // 最紧急的救援还剩几秒
  let minRescueSeconds = Number.POSITIVE_INFINITY;
  for (const r of state.rescues) {
    if (r.status !== 'active') continue;
    const left = (1 - r.danger) * r.dangerSeconds;
    if (left < minRescueSeconds) minRescueSeconds = left;
  }

  // 囚车进度
  let current = 0;
  let total = 0;
  for (const goal of state.level.goals) {
    total += goal.count;
    current +=
      goal.type === 'any'
        ? Math.min(goal.count, state.totalCleared)
        : Math.min(goal.count, state.clearedCount[goal.type] ?? 0);
  }

  return {
    typeCounts,
    minRescueSeconds,
    prisonRatio: total === 0 ? 0 : current / total,
  };
}

/** 回答一道题：答对给工具，答错什么都没 */
export function answerQuiz(
  state: GameState,
  optionIndex: number,
): {
  state: GameState;
  granted: { name: string; icon: string; effectText: string; desc: string } | null;
} {
  const quiz = state.pendingQuiz;
  if (!quiz) return { state, granted: null };

  const option = quiz.options[optionIndex];
  if (!option) return { state: { ...state, pendingQuiz: null }, granted: null };

  // 动态判定：有些选项只有特定棋盘状态才成立
  const ctx = buildQuizContext(state);
  if (!isOptionRight(option, ctx)) {
    return { state: { ...state, pendingQuiz: null, quizzesTaken: state.quizzesTaken + 1 }, granted: null };
  }

  const tool = getTool(quiz.reward);
  if (!tool) return { state: { ...state, pendingQuiz: null }, granted: null };

  // 答对：给这个领导记一条罪状（集齐 5 条解锁「一个算三个」）
  const crimeBoss = quiz.from ?? state.level.types[0] ?? 'pua';
  let next: GameState = {
    ...state,
    pendingQuiz: null,
    quizzesTaken: state.quizzesTaken + 1,
    crimeBook: addCrime(state.crimeBook, crimeBoss),
  };
  const e = tool.effect;

  if (e.kind === 'moves') {
    next = { ...next, movesLeft: next.movesLeft + e.amount };
  } else if (e.kind === 'score') {
    next = { ...next, score: next.score + e.amount };
  } else if (e.kind === 'rage') {
    next = { ...next, rage: Math.min(next.rageMax, next.rage + e.amount) };
  } else {
    // 清行 / 清列 / 十字 / 随机 —— 真的改棋盘
    const rng = createRng(state.seed + state.quizzesTaken * 977);
    const applied = applyToolToBoard(next, e, rng);
    next = applied.state;
  }

  return {
    state: next,
    granted: { name: tool.name, icon: tool.icon, effectText: describeEffect(e), desc: tool.desc },
  };
}

/**
 * 目标是否全部达成。
 *
 * 'any' 类型的目标看的是「清理总数」，不是某一种类型。
 */
export function goalsMet(state: GameState): boolean {
  return state.level.goals.every((goal) => goalCurrent(state, goal) >= goal.count);
}

/** 某个目标当前完成了多少 */
export function goalCurrent(state: GameState, goal: GameState['level']['goals'][number]): number {
  // 连击模式：数「完成了几次 size 连」
  if (goal.size && goal.size >= 3) {
    const key = `${goal.type}:atleast${goal.size}`;
    return Math.min(goal.count, state.matchStats?.[key] ?? 0);
  }
  if (goal.type === 'any') return Math.min(goal.count, state.totalCleared);
  return Math.min(goal.count, state.clearedCount[goal.type] ?? 0);
}

/** 目标进度（0-1） */
export function goalProgress(
  state: GameState,
): Array<{ goal: GameState['level']['goals'][number]; current: number; ratio: number }> {
  return state.level.goals.map((goal) => {
    const current = goalCurrent(state, goal);
    return { goal, current, ratio: goal.count === 0 ? 1 : current / goal.count };
  });
}

/**
 * 死局重排：保留所有格子（类型不变），只打乱位置。
 * 重排后仍可能有死局，最多尝试 20 次。
 */
function shuffleBoard(board: Board, level: LevelConfig, rng: Rng): Board {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const tiles: Tile[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const cell = getCell(board, r, c);
        if (cell) tiles.push(cell);
      }
    }
    rng.shuffle(tiles);

    const next: Board = Array.from({ length: rows }, () => Array<Cell>(cols).fill(null));
    let idx = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const tile = tiles[idx];
        idx += 1;
        if (tile) {
          next[r]![c] = { ...tile, viewRow: r, viewCol: c, state: 'idle' };
        }
      }
    }

    if (findMatches(next).length === 0 && findHint(next)) return next;
  }

  // 实在打不乱就重新生成（概率极低）
  return generateBoard(level, rng);
}

// ---------------------------------------------------------------- 收网行动
/**
 * 「收网行动」：怒值满时释放，清空全盘某一类坏人。
 *
 * 为什么设计成「清一类」而不是「清全盘」：
 *   · 清全盘太强，玩家会攒着不放，失去节奏感
 *   · 清一类需要玩家判断「哪类最多/最想清」，才有决策乐趣
 */
export function triggerSweep(
  state: GameState,
  type: VillainType,
  rng: Rng,
): { state: GameState; ok: boolean; cleared: number } {
  if (state.phase !== 'idle') return { state, ok: false, cleared: 0 };
  if (state.rage < state.rageMax) return { state, ok: false, cleared: 0 };
  // 模式限定收网次数（解恨模式是 Infinity）
  if (state.sweepUsed >= state.modeConfig.sweepLimit) return { state, ok: false, cleared: 0 };

  const coords: Coord[] = [];
  for (let r = 0; r < state.board.length; r += 1) {
    for (let c = 0; c < (state.board[r]?.length ?? 0); c += 1) {
      const cell = getCell(state.board, r, c);
      if (cell && cell.type === type) coords.push({ row: r, col: c });
    }
  }

  if (coords.length === 0) return { state, ok: false, cleared: 0 };

  const outcome = clearMatches(state.board, coords, 1, 0, state.modeConfig.chainCap);
  let board = removeCleared(outcome.board, outcome.cleared);

  const dropStarts = new Map<Tile, number>();
  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < (board[r]?.length ?? 0); c += 1) {
      const tile = getCell(board, r, c);
      if (tile) dropStarts.set(tile, tile.viewRow);
    }
  }

  const gravity = applyGravity(board, state.covers);
  board = gravity.board;
  board = refillBoard(board, state.level, rng, state.covers);

  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < (board[r]?.length ?? 0); c += 1) {
      const tile = getCell(board, r, c);
      if (!tile) continue;
      const startRow = dropStarts.get(tile);
      if (startRow !== undefined) tile.dropFromRow = startRow;
    }
  }

  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < (board[r]?.length ?? 0); c += 1) {
      const cell = getCell(board, r, c);
      if (cell) cell.state = 'idle';
    }
  }

  const clearedCount = { ...state.clearedCount };
  const matchStats: Record<string, number> = { ...state.matchStats };
  // 文件堆在这一手里可能被相邻消除清掉，用副本边走边改
  const coversForBoard: boolean[][] = state.covers.map((row) => [...row]);
  for (const [t, count] of Object.entries(outcome.counts)) {
    const key = t as VillainType;
    clearedCount[key] = (clearedCount[key] ?? 0) + (count ?? 0);
  }

  const rescueAfterSweep = feedRescue(state, outcome.counts);

  let next: GameState = {
    ...state,
    board,
    score: state.score + Math.round(outcome.score * 1.5),
    rage: 0,
    clearedCount,
    rescues: rescueAfterSweep.rescues,
    rescuedCount: rescueAfterSweep.rescuedCount,
    lostCount: rescueAfterSweep.lostCount,
    rescuePenalty: rescueAfterSweep.rescuePenalty,
    totalCleared: state.totalCleared + outcome.cleared.length,
    sweepUsed: state.sweepUsed + 1,
    events: [
      {
        chain: 1,
        cleared: outcome.cleared.length,
        points: Math.round(outcome.score * 1.5),
        label: '收网行动',
        cells: outcome.cleared,
        type,
        move: 0,
      },
    ],
    hint: null,
    phase: 'idle',
  };

  if (goalsMet(next)) next = { ...next, phase: 'won' };
  else if (next.movesLeft <= 0) next = { ...next, phase: 'lost' };

  return { state: next, ok: true, cleared: outcome.cleared.length };
}

// ---------------------------------------------------------------- 辅助
/** 当前救援目标（界面用） */
export function activeRescues(state: GameState) {
  return state.rescues;
}

/** 请求提示（无操作一段时间后调用） */export function requestHint(state: GameState): GameState {
  if (state.phase !== 'idle') return state;
  const hint = findHint(state.board);
  return { ...state, hint };
}

/** 计算星级 0-3 */
export function computeStars(state: GameState): number {
  if (state.phase !== 'won') return 0;

  // 救援失败会砍星：救丢一个人最多只能拿 2 星，丢两个就只能 1 星。
  // 用「封顶」而不是「扣分」，玩家更容易理解规则。
  let cap = 3;
  if (state.rescuePenalty > 0) {
    cap = Math.max(1, 3 - state.rescuePenalty);
  }

  const [s1, s2, s3] = state.level.starScores;
  let stars = 1;
  if (state.score >= s3) stars = 3;
  else if (state.score >= s2) stars = 2;
  else if (state.score >= s1) stars = 1;

  return Math.min(stars, cap);
}

/** 给 UI 用的本局摘要 */
export function summarize(state: GameState) {
  return {
    score: state.score,
    stars: computeStars(state),
    maxChain: state.maxChain,
    totalCleared: state.totalCleared,
    movesLeft: state.movesLeft,
    clearedCount: state.clearedCount,
    sweepUsed: state.sweepUsed,
    rescuedCount: state.rescuedCount,
    lostCount: state.lostCount,
    rescuePenalty: state.rescuePenalty,
    mode: state.mode,
  };
}
