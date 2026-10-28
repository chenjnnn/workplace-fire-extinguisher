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
  findMatches,
  getCell,
  groupByType,
  inBounds,
  isAdjacent,
  isFull,
  sameCoord,
  swappedBoard,
} from './match.ts';
import { describeEffect, drawQuiz, getTool, type Quiz } from './quiz.ts';
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
/**
 * 按权重抽一种颜色。
 *
 * 关卡可以给某种颜色更高的权重让它更常出现（比如给干扰色加权），
 * 也可以给当前目标色降权让它更难凑 —— 这是除时间之外的第二根难度旋钮。
 */
function pickWeighted(
  types: VillainType[],
  weights: Partial<Record<VillainType, number>> | undefined,
  rng: Rng,
): VillainType {
  if (!weights) return rng.pick(types);
  let total = 0;
  for (const t of types) total += Math.max(0, weights[t] ?? 1);
  if (total <= 0) return rng.pick(types);
  let r = rng.next() * total;
  for (const t of types) {
    r -= Math.max(0, weights[t] ?? 1);
    if (r <= 0) return t;
  }
  return types[types.length - 1] ?? 'pua';
}

/** 补块时决定颜色：目标色够多就降权，不够就保底 */
function pickRefillType(
  board: Board,
  level: LevelConfig,
  rng: Rng,
  targetType?: VillainType | null,
): VillainType {
  if (!targetType || !level.types.includes(targetType)) {
    return pickWeighted(level.types, level.typeWeights, rng);
  }

  let count = 0;
  for (const row of board) {
    for (const tile of row) if (tile?.type === targetType) count += 1;
  }

  // 保底：棋盘上不足 3 个，60% 直接补它
  // 阈值从 3 提到 4：避免「刚好 3 个」时在保底/降权之间反复横跳
  if (count < 4 && rng.next() < 0.6) return targetType;

  // 否则降权，让它更难凑
  return pickWeighted(level.types, withTargetPenalty(level.typeWeights, targetType), rng);
}

/**
 * 给「当前目标色」再降一档权重。
 *
 * 静态权重表达的是「这一关整体偏难」，而玩家真正卡住的是「现在要抓的这个颜色不来」。
 * 所以每次补块都按当前目标色动态打折，难度才跟着链走。
 */
function withTargetPenalty(
  weights: Partial<Record<VillainType, number>> | undefined,
  target: VillainType | null | undefined,
): Partial<Record<VillainType, number>> | undefined {
  if (!weights || !target) return weights;
  const base = weights[target];
  if (base === undefined) return weights;
  return { ...weights, [target]: Math.max(0.25, base * 0.7) };
}

function generateBoard(level: LevelConfig, rng: Rng): Board {
  const { rows, cols, types } = level;
  const board: Board = Array.from({ length: rows }, () => Array<Cell>(cols).fill(null));

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      // 最多尝试有限次，避免极端情况下死循环
      let chosen: VillainType | null = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const candidate = pickWeighted(types, level.typeWeights, rng);
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
    elapsedSeconds: 0,
    timeoutsUsed: 0,
    taskTimeLeft: level.taskTimerSeconds ?? 0,
    levelTimeLeft: level.levelTimerSeconds ?? 0,
    seqIndex: 0,
    seqProgress: 0,
    offTargetCleared: 0,
    sweepScore: 0,
    offTargetStreak: 0,
    taskStreak: 0,
    pendingReward: null,
    skipsUsed: 0,
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
    flatterer: 0,
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
          if (!target) continue;
          next[b.row]![b.col] = null;
          actuallyCleared.push(b);
        }
      }

      /**
       * 甩锅侠的「污染相邻格」已经删除。
       *
       * 原因：中毒必须被玩家看见，但任何视觉效果（暗角、绿色、虚线框）
       * 都会让同一种颜色出现两个版本 —— 用户明确要求「同一种颜色必须一样」。
       * 两件事无法同时成立，所以直接去掉机制，甩锅侠变成普通角色。
       */

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
/**
 * 补块。
 *
 * `weightedType` 是「保底」用的：当囚车当前要抓的颜色在棋盘上不足 3 个时，
 * 新块的生成会偏向这个颜色，避免出现「目标色一直不来」的死等。
 *
 * 为什么需要它：顺序囚车下，如果当前目标色在棋盘上只剩 1-2 个，
 * 玩家可能连续十几步都推进不了，体验是「卡住了」而不是「难」。
 */
function refillBoard(
  board: Board,
  level: LevelConfig,
  rng: Rng,
  /**
   * 当前任务要抓的颜色。
   *
   * 它有两个相反的作用，靠棋盘上还剩几个来区分：
   *   · 少于 3 个 → 保底加权（60% 偏向它），防止玩家一个都凑不出来
   *   · 够多       → 降权（权重打 7 折），让难度真正跟着链走
   */
  targetType?: VillainType | null,
): Board {
  const next = board.map((row) => [...row]);
  const rows = next.length;
  const cols = next[0]?.length ?? 0;

  for (let c = 0; c < cols; c += 1) {
    // 该列有几个空位
    let holes = 0;
    for (let r = 0; r < rows; r += 1) {
      if (!next[r]![c]) holes += 1;
    }
    if (holes === 0) continue;

    // 从上往下找到第一个空位之前的连续非空段会自然下落，
    // 这里只需要在顶部生成 holes 个新格子
    for (let i = 0; i < holes; i += 1) {
      const type = pickRefillType(next, level, rng, targetType);
      const tile = makeTile(type, -1 - i, c, false, rng.int(3));
      tile.state = 'spawning';
      tile.dropFromRow = -1 - i;
      // 找到该列最上面的空位放进去（applyGravity 之后调用，顶部一定是空的）
      for (let r = 0; r < rows; r += 1) {
        if (!next[r]![c]) {
          next[r]![c] = tile;
          break;
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
  let seqIndex = state.seqIndex;
  let seqProgress = state.seqProgress;
  let offTargetCleared = state.offTargetCleared;
  let sweepScore = state.sweepScore;
  let offTargetStreak = state.offTargetStreak;
  let taskStreak = state.taskStreak;
  let pendingReward = state.pendingReward;
  // 这一手的得分（在循环里按 chain 累加，用于决定收网积分）
  let gainedThisMove = 0;
  /**
   * 这一手是否已经推进过任务链。
   *
   * 用户的要求：「我消除蓝色的时候正好消除了粉色，不能视作下一个任务粉色完成了」。
   * 所以一次操作（含它的连锁）只认第一次命中当前目标色的消除，
   * 同一手里顺手消掉的其他颜色不算进度。
   */
  let advancedThisMove = false;
  let totalCleared = 0;
  let rescueState = state;
  let hadMatch = false;
  const move = state.level.moves - state.movesLeft + 1;

  // 保险：连锁最多 30 层，防止逻辑 bug 导致死循环
  const MAX_CHAIN = 30;

  for (let i = 0; i < MAX_CHAIN; i += 1) {
    const matches = findMatches(board);
    if (matches.length === 0) break;

    hadMatch = true;
    chain += 1;
    maxChain = Math.max(maxChain, chain);
    // 当前是第几波匹配（1 = 玩家这次交换直接产生的）
    const chain_i = chain;

    /**
     * 这一波**匹配到**的类型（含只是掉血、没被清掉的）。
     *
     * 为什么需要它：抢功精有 2 滴血，第一次消除只掉血、不消失，
     * 所以 outcome.counts 里没有它 —— 任务就推进不了，玩家看到消除动画却「卡住」。
     * 任务判定按「匹配到」算，符合玩家直觉。
     */
    const matchedTypes = new Set<VillainType>();
    for (const m of matches) {
      const t = getCell(board, m.row, m.col);
      if (t) matchedTypes.add(t.type);
    }

    const outcome = clearMatches(board, matches, chain, move, state.modeConfig.chainCap);
    board = outcome.board;
    score += outcome.score;
    rage += outcome.rage;
    // 恶霸反击只扣分（在 outcome.score 里已体现），不影响步数
    score -= Math.round(outcome.overtimePenalty * VILLAINS.overtime.baseScore);
    events.push(...outcome.events);
    totalCleared += outcome.cleared.length;
    // 这一手（含连锁）累计的得分，用来决定要不要计入收网进度
    gainedThisMove += outcome.score;

    // 累计清理数（这里只看真正被消掉的，用于统计和展示）
    for (const [type, count] of Object.entries(outcome.counts)) {
      const key = type as VillainType;
      clearedCount[key] = (clearedCount[key] ?? 0) + (count ?? 0);
    }

    /**
     * ============ 任务链推进 ============
     *
     * 关键点（这里踩过三次坑）：
     *   1. 用「这一波**匹配到**的类型」判断，而不是「被清掉的类型」。
     *      抢功精有 2 滴血，第一次消除只是掉血，outcome.counts 是**空的** ——
     *      如果在这里面判断，推进逻辑压根不会执行，玩家会看到「完成任务但囚车不动」。
     *   2. 只认第一波匹配（chain_i === 1），连锁掉下来的不算。
     *   3. 整手只推进一次，而且一次只推一格。
     */
    const targetChain = state.level.targetChain;
    const target = targetChain[seqIndex];
    const isFirstWave = chain_i === 1;

    if (isFirstWave && !advancedThisMove && target && matchedTypes.has(target)) {
      advancedThisMove = true;
      seqIndex += 1;
      seqProgress = 0;
      // 完成任务：连消计数清零
      offTargetStreak = 0;

      /**
       * 连击奖励（用户的要求）：
       *   · 连续完成 2 次任务 → 分数奖励
       *   · 连续完成 4 次任务 → 步数奖励
       *   · 中间有任何「非任务操作」（消非目标色 / 跳过）都会打断连击
       *
       * 原来这里是「问答卡」，用户要求删掉问答、改成这个。
       */
      taskStreak += 1;
      if (taskStreak === 2) {
        score += 600;
        pendingReward = { kind: 'score', amount: 600, streak: 2 };
      } else if (taskStreak >= 4) {
        movesLeft += 2;
        pendingReward = { kind: 'moves', amount: 2, streak: 4 };
        taskStreak = 0;
      }
    }

    /**
     * ============ 跳过积分 ============
     *
     * 用户确认的规则：**只有「非目标色的消除」才攒跳过进度**。
     *
     * 为什么这么改：之前 `score` 里既有目标色的分也有杂色的分，
     * 于是「消得顺 → 跳过快 → 推进快 → 更容易连击 → 又攒更多分」形成正反馈。
     * 现在把两种分分开：
     *   · 消目标色 = 做正事，推进任务链，但**不**攒跳过
     *   · 消杂色   = 用步数"刷"出来的分，才能换跳过
     * 想跳就得牺牲几步去消无关颜色 —— 这才是真正的取舍。
     */
    const hitTarget = Boolean(target && matchedTypes.has(target));
    if (!hitTarget) {
      for (const [type, count] of Object.entries(outcome.counts)) {
        if (type !== target) offTargetCleared += count ?? 0;
      }
      if (isFirstWave) {
        offTargetStreak += 1;
        taskStreak = 0; // 消了非目标色 = 打断连击
      }
    }

    // 只有这一手没命中目标色时，才算进跳过进度
    if (!hitTarget) {
      const mode = state.level.sweepMode ?? 'score';
      if (mode === 'score' || offTargetStreak <= 3) {
        sweepScore += gainedThisMove;
      }
    }

    // 消除结果反馈到救援进度
    rescueState = feedRescue(rescueState, outcome.counts);

    // 移除 → 重力 → 填充
    board = removeCleared(board, outcome.cleared);

    // 记录掉落起点：每个格子要到哪一行，以及它原来在哪一行
    const dropStarts = new Map<Tile, number>();
    for (let r = 0; r < board.length; r += 1) {
      for (let c = 0; c < (board[r]?.length ?? 0); c += 1) {
        const tile = getCell(board, r, c);
        if (tile) dropStarts.set(tile, tile.viewRow);
      }
    }

    const gravity = applyGravity(board);
    board = gravity.board;
    board = refillBoard(board, state.level, rng, shortageType(board, state));

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
    // 洗牌后保证当前目标色至少出现 3 个，否则玩家还是没得打
    board = ensureTargetPresent(board, state, rng);
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
    // 倒计时：每抓完一格重置任务计时
    taskTimeLeft:
      seqIndex !== state.seqIndex && state.level.taskTimerSeconds
        ? state.level.taskTimerSeconds
        : state.taskTimeLeft,
    levelTimeLeft: state.levelTimeLeft,
    sweepScore,
    offTargetStreak,
    taskStreak,
    pendingReward,
    // 囚车（按颜色顺序）的进度
    seqIndex,
    seqProgress,
    offTargetCleared,
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
    /**
     * 全部隔间抓完 → 立即通关，剩余步数转成分数。
     * 这样「提前完成」是有奖励的，玩家会想优化而不是拖到最后一刻。
     */
    next = {
      ...next,
      phase: 'won',
      score: next.score + Math.min(next.movesLeft * 100, 800),
    };
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
  const filled = refillBoard(
    gravity.board,
    state.level,
    rng,
    state.level.targetChain[state.seqIndex] ?? null,
  );
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
  /**
   * 用户要求：「删掉问题卡这一功能」，改成连击奖励。
   * 所以这里直接返回 false，问答系统整体下线（代码保留，以后想恢复改这里）。
   */
  return false;
}
function shouldTriggerQuizLegacy(state: GameState): boolean {
  if (state.phase !== 'idle') return false;
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

  if (!option.correct) {
    return { state: { ...state, pendingQuiz: null, quizzesTaken: state.quizzesTaken + 1 }, granted: null };
  }

  const tool = getTool(quiz.reward);
  if (!tool) return { state: { ...state, pendingQuiz: null }, granted: null };

  let next: GameState = { ...state, pendingQuiz: null, quizzesTaken: state.quizzesTaken + 1 };
  const e = tool.effect;

  if (e.kind === 'moves') {
    next = { ...next, movesLeft: next.movesLeft + e.amount };
  } else if (e.kind === 'time') {
    // 加时间：有倒计时才有意义，没倒计时的关卡自动变成加 1 步
    const before = next.taskTimeLeft + next.levelTimeLeft;
    next = addTime(next, e.amount);
    const after = next.taskTimeLeft + next.levelTimeLeft;
    if (after === before) next = { ...next, movesLeft: next.movesLeft + 1 };
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
 * 保证当前目标色在棋盘上至少 3 个（洗牌后用）。
 * 不够就随机把几个格子改成目标色。
 */
function ensureTargetPresent(board: Board, state: GameState, rng: Rng): Board {
  const target = state.level.targetChain[state.seqIndex];
  if (!target) return board;

  const spots: Array<{ row: number; col: number }> = [];
  let count = 0;
  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < (board[r]?.length ?? 0); c += 1) {
      const tile = board[r]?.[c];
      if (!tile) continue;
      if (tile.type === target) count += 1;
      else spots.push({ row: r, col: c });
    }
  }
  if (count >= 3) return board;

  const next = board.map((row) => [...row]);
  for (let i = 0; i < 3 - count; i += 1) {
    const spot = spots[rng.int(spots.length)];
    if (!spot) break;
    const tile = next[spot.row]?.[spot.col];
    if (!tile) continue;
    next[spot.row]![spot.col] = { ...tile, type: target, hp: VILLAINS[target].hp };
  }
  return next;
}

/**
 * 当前目标色在棋盘上不足 3 个时返回该颜色，否则返回 null。
 * 用来决定补块要不要「保底加权」。
 */
function shortageType(
  board: Board,
  state: GameState,
): VillainType | null {
  const target = state.level.targetChain[state.seqIndex];
  if (!target) return null;
  let count = 0;
  for (const row of board) {
    for (const tile of row) {
      if (tile && tile.type === target) count += 1;
    }
  }
  return count < 3 ? target : null;
}


/**
 * 推进倒计时（引擎每帧调用，dt 单位秒）。
 *
 * 两种倒计时：
 *   · taskTimeLeft  —— 每个囚车间隔的时限，抓完一格就重置
 *   · levelTimeLeft —— 整关时限，不会重置
 * 归零 = 失败（领导跑了）。
 */
export function tickTimer(state: GameState, dt: number): GameState {
  if (state.phase !== 'idle') return state;

  // 顺手累计真实用时（引擎只在这三件事都不发生时才会调 tickTimer）
  state = { ...state, elapsedSeconds: (state.elapsedSeconds ?? 0) + dt };

  const hasLevel = state.level.levelTimerSeconds ? state.levelTimeLeft > 0 : false;
  const hasTask = state.level.taskTimerSeconds ? state.taskTimeLeft > 0 : false;
  if (!hasLevel && !hasTask) return state;

  let next = state;

  if (hasLevel) {
    const left = state.levelTimeLeft - dt;
    if (left <= 0) return { ...state, levelTimeLeft: 0, phase: 'lost' };
    next = { ...next, levelTimeLeft: left };
  }

  if (hasTask && !hasLevel) {
    const left = state.taskTimeLeft - dt;
    if (left <= 0) {
      /**
       * 超时处理（用户定的规则）：
       *   第一次 → 扣 2 步 + 计时器重置，不判负
       *   第二次 → 判负
       * 这样「目标色一直不来」不会一次就前功尽弃。
       */
      const used = state.timeoutsUsed ?? 0;
      if (used === 0) {
        const movesLeft = Math.max(0, next.movesLeft - 2);
        return {
          ...next,
          taskTimeLeft: state.level.taskTimerSeconds ?? 0,
          movesLeft,
          timeoutsUsed: 1,
          // 步数被扣到 0 也算失败
          phase: movesLeft <= 0 ? 'lost' : 'idle',
        };
      }
      return { ...next, taskTimeLeft: 0, timeoutsUsed: used + 1, phase: 'lost' };
    }
    next = { ...next, taskTimeLeft: left };
  }

  return next;
}

/** 加时间（道具用）：优先加任务计时，没有再尝试整关计时 */
export function addTime(state: GameState, seconds: number): GameState {
  if (state.level.levelTimerSeconds) {
    return { ...state, levelTimeLeft: state.levelTimeLeft + seconds };
  }
  if (state.level.taskTimerSeconds) {
    return { ...state, taskTimeLeft: state.taskTimeLeft + seconds };
  }
  return state;
}

/**
 * 跳过当前囚车间隔（用「非目标消除数」换）。
 *
 * 规则：每消除 5 个非目标色，换一次跳过机会。
 * 跳过拿不到这一格的分数，但可以避免卡在一个暂时打不出来的颜色上。
 */
export function skipCurrentTarget(state: GameState): { state: GameState; ok: boolean } {
  if (state.phase !== 'idle') return { state, ok: false };
  if (state.seqIndex >= state.level.targetChain.length) return { state, ok: false };

  const earned = Math.floor(state.offTargetCleared / 5);
  if (earned <= state.skipsUsed) return { state, ok: false };

  return {
    state: {
      ...state,
      seqIndex: state.seqIndex + 1,
      seqProgress: 0,
      skipsUsed: state.skipsUsed + 1,
    },
    ok: true,
  };
}

/**
 * 当前要抓的颜色（任务链上第一个没完成的）。
 * 链上全部完成时返回 null。
 */
export function currentTarget(state: GameState): VillainType | null {
  return state.level.targetChain[state.seqIndex] ?? null;
}

/** 链上所有格都完成了 */
export function goalsMet(state: GameState): boolean {
  return state.seqIndex >= state.level.targetChain.length;
}

/**
 * 囚车面板用的进度数据。
 *
 * 每一格只有三种状态，**没有数量**：
 *   done    —— 已经抓完（打勾变灰）
 *   current —— 正在抓（高亮）
 *   future  —— 还没轮到（压暗）
 */
export function sequenceProgress(state: GameState): Array<{
  type: VillainType;
  index: number;
  state: 'done' | 'current' | 'future';
}> {
  return state.level.targetChain.map((type, index) => {
    if (index < state.seqIndex) return { type, index, state: 'done' as const };
    if (index === state.seqIndex) return { type, index, state: 'current' as const };
    return { type, index, state: 'future' as const };
  });
}

/**
 * 失败时还差什么（给结算页用）。
 *
 * 链上没有数量，所以「还差」就是「还剩几个什么颜色」。
 */
export function missingTargets(state: GameState): Array<{ type: VillainType; left: number }> {
  const rest = state.level.targetChain.slice(state.seqIndex);
  const merged: Array<{ type: VillainType; left: number }> = [];
  for (const type of rest) {
    const hit = merged.find((m) => m.type === type);
    if (hit) hit.left += 1;
    else merged.push({ type, left: 1 });
  }
  return merged;
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
/**
 * 收网 —— 现在是「分数达标后跳过当前任务」。
 *
 * 用户的要求：「当分数超过多少时能够激活收网，激活后随时点击收网，
 * 就能跳过当前这个颜色的任务，视为这个任务已完成」。
 *
 * 所以它不再清棋盘，而是直接推进任务链一格 ——
 * 本质是「用分数换一次跳过」，用来解开卡在某个颜色的局面。
 */
/** 默认两次激活门槛（关卡没配时用） */
export const DEFAULT_SWEEP_THRESHOLDS: [number, number] = [2500, 5500];

/** 这一关的两个门槛 */
export function sweepThresholdsOf(state: GameState): [number, number] {
  return state.level.sweepThresholds ?? DEFAULT_SWEEP_THRESHOLDS;
}

/** 按分数算，一共攒到几次收网机会（0/1/2） */
export function sweepEarned(state: GameState): number {
  const [a, b] = sweepThresholdsOf(state);
  const s = state.sweepScore;
  if (s >= b) return 2;
  if (s >= a) return 1;
  return 0;
}

/** 现在能不能收网 */
export function canSweepNow(state: GameState): boolean {
  if (state.phase !== 'idle') return false;
  if (state.seqIndex >= state.level.targetChain.length) return false;
  return sweepEarned(state) > state.sweepUsed;
}

/**
 * 距离下一次收网还差多少（给圆环进度用）。
 * 返回 { from, to, ratio }：from = 上一次门槛，to = 下一次门槛，ratio = 0-1
 */
export function sweepProgress(state: GameState): { from: number; to: number; ratio: number } {
  const [a, b] = sweepThresholdsOf(state);
  const used = state.sweepUsed;
  const from = used === 0 ? 0 : used === 1 ? a : b;
  const to = used === 0 ? a : b;
  if (to <= from) return { from, to, ratio: 1 };
  return { from, to, ratio: Math.min(1, Math.max(0, (state.sweepScore - from) / (to - from))) };
}

export function triggerSweep(
  state: GameState,
  _type: VillainType,
  _rng: Rng,
): { state: GameState; ok: boolean; cleared: number } {
  if (!canSweepNow(state)) return { state, ok: false, cleared: 0 };

  // 跳过当前这一格：视为已完成
  /**
   * 跳过只前进一格。
   *
   * 之前这里有个 while，遇到「链上连续同色」会一次跳两格 ——
   * 用户实测「点跳过一下子跳了两个任务」就是这个。
   * 现在链本身保证相邻不同色（见 levels.ts），跳过也只走一步。
   */
  const chain = state.level.targetChain;
  const seqIndex = state.seqIndex + 1;

  const next: GameState = {
    ...state,
    seqIndex,
    seqProgress: 0,
    sweepUsed: state.sweepUsed + 1,
    // 跳过不算「完成任务」，会打断连击
    taskStreak: 0,
  };

  // 如果这一跳正好让链走完，就直接判通关
  if (seqIndex >= chain.length) {
    return {
      state: {
        ...next,
        phase: 'won',
        score: next.score + Math.min(next.movesLeft * 100, 800),
      },
      ok: true,
      cleared: 0,
    };
  }
  return { state: next, ok: true, cleared: 0 };
}

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
