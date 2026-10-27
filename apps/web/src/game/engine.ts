/**
 * 游戏引擎 —— 把「模型」和「动画」缝起来
 *
 * 分工：
 *   · @vc/core 负责规则（能不能消、得分、胜负）—— 纯逻辑、可单测
 *   · 这个文件负责手感（动画、粒子、震屏、音效）—— 只跟 Canvas 打交道
 *
 * 关键设计：每帧先把所有格子的 viewRow/viewCol 往目标位置插值，
 * 「消除 / 掉落」都只是格子位置的变化，不需要为每种动画写一套代码。
 */

import {
  VILLAINS,
  comboLabel,
  computeStars,
  createGame,
  createRng,
  findHint,
  getCell,
  sequenceProgress,
  tickTimer,
  addTime,
  skipCurrentTarget,
  currentTarget,
  goalsMet,
  resolveStep,
  answerQuiz,
  judgeAnswer,
  shouldTriggerQuiz,
  triggerQuiz,
  summarize,
  triggerSweep,
  trySwap,
  advanceRescue,
  type AvatarConfig,
  type Board,
  type ComboEvent,
  type Coord,
  type GameMode,
  type GameState,
  type Rng,
  type VillainType,
} from '@vc/core';
import { sound } from './audio';
import { SpriteCache, drawSlapHand, drawSlapImpact, roundRect } from './preload';

// ---------------------------------------------------------------- 对外类型
export interface HudSnapshot {
  score: number;
  movesLeft: number;
  rage: number;
  rageMax: number;
  phase: GameState['phase'];
  /** 囚车：按顺序要抓的颜色（三种状态：done / current / future） */
  sequence: Array<{
    type: VillainType;
    name: string;
    color: string;
    state: 'done' | 'current' | 'future';
    current: number;
    need: number;
  }>;
  /** 当前目标色（棋盘高亮用） */
  targetType: VillainType | null;
  /** 非目标消除累计（每 5 个可跳过一格） */
  offTargetCleared: number;
  /** 当前任务的剩余秒数（0 = 没有任务倒计时） */
  taskTimeLeft: number;
  /** 整关剩余秒数（0 = 没有整关倒计时） */
  levelTimeLeft: number;
  /** 任务倒计时的总时长（用来画进度条） */
  taskTimeTotal: number;
  /** 整关倒计时的总时长 */
  levelTimeTotal: number;
  /** 还能跳过几次 */
  skipsLeft: number;
  combo: { label: string; chain: number; points: number } | null;
  maxChain: number;
  totalCleared: number;
  stars: number;
  seed: number;
  canSweep: boolean;
  mode: GameMode;
  modeName: string;
  rescues: Array<{
    id: string;
    name: string;
    situation: string;
    type: VillainType;
    typeName: string;
    progress: number;
    needed: number;
    danger: number;
    status: 'active' | 'rescued' | 'lost';
    avatar: AvatarConfig;
    dangerSeconds: number;
  }>;
  sweepUsed: number;
  sweepLimit: number;
  /** 整体进度：把本关所有目标合并成一个大进度条 */
  overall: { current: number; total: number; ratio: number };
  /** 待回答的问答（null = 没有） */
  pendingQuiz: {
    prompt: string;
    bossName: string;
    bossType: VillainType;
    options: Array<{ text: string; reaction: string }>;
  } | null;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  levelId: number;
  seed?: number;
  mode?: GameMode;
  avatar: AvatarConfig | null;
  onHud: (snapshot: HudSnapshot) => void;
  onCombo?: (event: ComboEvent) => void;
  onFinish?: (state: GameState) => void;
}

// ---------------------------------------------------------------- 内部类型
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
  bold: boolean;
}

interface Tween {
  id: number;
  mode: 'linear' | 'outBack' | 'inQuad' | 'outQuad';
  duration: number;
  elapsed: number;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  onDone?: () => void;
}

interface Layout {
  width: number;
  height: number;
  boardX: number;
  boardY: number;
  cell: number;
}

const HINT_DELAY_MS = 4200;

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  private rng: Rng;
  private sprites = new SpriteCache();
  private options: EngineOptions;

  private layout: Layout = { width: 0, height: 0, boardX: 0, boardY: 0, cell: 0 };
  private dpr = 1;

  private raf = 0;
  private lastFrame = 0;
  private time = 0;
  private destroyed = false;

  private tweens = new Map<number, Tween>();
  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  /**
   * 正在「被扇飞」的牌。
   *
   * 为什么单独维护：模型里被消除的牌已经删掉了，
   * 但动画需要它在画面上继续飞 0.3 秒，所以只能自己存一份。
   */
  /**
   * 扇巴掌的手。一次消除只画一只手（横扫整组），
   * 而不是每张牌各画一只 —— 那样会变成群魔乱舞。
   */
  private slapHands: Array<{
    x: number;
    y: number;
    startAt: number;
    fromLeft: boolean;
    scale: number;
  }> = [];

  /** 已答过的题 id（跨局持久化，保证不重复） */
  /** 是否暂停中 */
  private paused = false;
  private quizUsedIds: string[] = [];
  /** 答题后的回调，用来把 usedIds 存进 localStorage */
  private onQuizUsed?: (ids: string[]) => void;
  /** 一次答题的浮层提示 */
  private quizToast: { text: string; kind: 'good' | 'bad' } | null = null;
  private quizToastUntil = 0;

  private flyingTiles: Array<{
    x: number;
    y: number;
    type: VillainType;
    variant: number;
    startAt: number;
    /** 飞走方向 */
    angle: number;
    /** 手从哪一侧扇过来 */
    fromLeft: boolean;
  }> = [];

  private shake = 0;
  private flash = 0;
  private flashColor = '#ffffff';

  private selected: Coord | null = null;
  private hint: { a: Coord; b: Coord } | null = null;
  private hintTimer = 0;

  private busy = false;
  private comboDisplay: { label: string; chain: number; points: number } | null = null;
  private comboDisplayTimer = 0;

  private pointerStart: { x: number; y: number; cell: Coord } | null = null;
  private dragCell: Coord | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private cleanupFns: Array<() => void> = [];
  /** 救援 HUD 节流：每帧都推 React 会把它压垮，80ms 一次足够 */
  private rescueHudTimer = 0;

  constructor(options: EngineOptions) {
    this.options = options;
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器不支持 canvas 2d');
    this.ctx = ctx;

    this.state = createGame(options.levelId, options.seed, options.mode ?? 'normal');
    this.rng = createRng(this.state.seed);

    this.attachResize();
    this.attachInput();
    this.resizeCanvas();
    this.emitHud();
    this.loop(performance.now());

    // e2e 探针：只读快照 + 触发输入，不能作弊改状态
    if (typeof window !== 'undefined') {
      (window as unknown as { __VC_ENGINE__?: unknown }).__VC_ENGINE__ = {
        snapshot: () => this.debugSnapshot(),
        /** 仅供 e2e：直接把本关判为通关（用来验证胜利页） */
        debugWin: () => {
          this.state = {
            ...this.state,
            phase: 'won',
            score: Math.max(this.state.score, 9200),
          };
          this.options.onFinish?.(this.state);
          this.emitHud();
        },
        /** 仅供 e2e：当前题目的正确选项下标 */
        quizCorrectIndex: () =>
          this.state.pendingQuiz?.options.findIndex((o) => o.correct) ?? -1,
        quizState: () => ({
          quizzesTaken: this.state.quizzesTaken,
          totalCleared: this.state.totalCleared,
          threshold: Math.floor(this.state.totalCleared / 12),
          pending: this.state.pendingQuiz?.id ?? null,
        }),
        tap: (row: number, col: number) => {
          this.selected = { row, col };
        },
        swap: (a: { row: number; col: number }, b: { row: number; col: number }) => {
          void this.attemptSwap(a, b);
        },
        sweep: () => this.sweep(),
        /** 仅供调试：看当前有没有手在飞 */
        debugSlap: () => ({
          count: this.slapHands.length,
          flying: this.flyingTiles.length,
          hands: this.slapHands.map((h) => ({
            x: Math.round(h.x),
            y: Math.round(h.y),
            age: Math.round(performance.now() - h.startAt),
          })),
        }),
        /**
         * 仅供 e2e：把怒值拉满，让「收网行动」能被稳定验证。
         * 正常游戏里怒值只能靠消除积累，这个方法不会出现在 UI 上。
         */
        /**
         * 仅供 e2e：把步数设成指定值。
         * 用来快速触发结算，不用真的走几十步（太慢且不稳定）。
         */
        debugSetMoves: (n: number) => {
          this.state = { ...this.state, movesLeft: Math.max(0, n) };
          if (this.state.movesLeft === 0) {
            this.state = { ...this.state, phase: 'lost' };
            this.options.onFinish?.(this.state);
          }
          this.emitHud();
        },
        debugFillRage: () => {
          this.state = { ...this.state, rage: this.state.rageMax };
          this.emitHud();
        },
        /**
         * 仅供 e2e：把所有救援目标推到失败，验证「失败不结束游戏」。
         * 正常游戏里只能靠倒计时自然失败。
         */
        debugForceRescueLoss: () => {
          this.state = {
            ...this.state,
            rescues: this.state.rescues.map((r) =>
              r.status === 'active' ? { ...r, danger: 1, status: 'lost' as const } : r,
            ),
            lostCount: this.state.lostCount + this.state.rescues.filter((r) => r.status === 'active').length,
            rescuePenalty: this.state.rescuePenalty + 1,
          };
          this.emitHud();
          return true;
        },
      };
    }
  }

  // ------------------------------------------------------------ 生命周期
  destroy(): void {
    this.destroyed = true;
    if (typeof window !== 'undefined') {
      delete (window as unknown as { __VC_ENGINE__?: unknown }).__VC_ENGINE__;
    }
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }

  restart(seed?: number): void {
    const levelId = this.state.level.id;
    this.state = createGame(levelId, seed, this.state.mode);
    this.rng = createRng(this.state.seed);
    this.tweens.clear();
    this.particles = [];
    this.floats = [];
    this.flyingTiles = [];
    this.slapHands = [];
    this.selected = null;
    this.hint = null;
    this.hintTimer = 0;
    this.busy = false;
    this.comboDisplay = null;
    this.syncAllPositions();
    this.emitHud();
  }

  setAvatar(avatar: AvatarConfig | null): void {
    this.options.avatar = avatar;
  }

  /** 玩家点「收网行动」 */
  sweep(): boolean {
    if (this.busy || this.state.phase !== 'idle') return false;
    if (this.state.rage < this.state.rageMax) return false;

    // 选棋盘上最多的一种类型来清
    const counts = new Map<VillainType, number>();
    for (const row of this.state.board) {
      for (const cell of row) {
        if (cell) counts.set(cell.type, (counts.get(cell.type) ?? 0) + 1);
      }
    }
    let best: VillainType = 'pua';
    let bestCount = -1;
    for (const [type, count] of counts) {
      if (count > bestCount) {
        best = type;
        bestCount = count;
      }
    }

    const result = triggerSweep(this.state, best, this.rng);
    if (!result.ok) return false;

    this.state = result.state;
    this.busy = true;
    this.hint = null;

    sound.play('sweep');
    this.shake = 14;
    this.flash = 1;
    this.flashColor = VILLAINS[best].color;

    // 全屏粒子
    for (let i = 0; i < 80; i += 1) {
      this.spawnParticle(
        this.layout.width * Math.random(),
        this.layout.height * Math.random(),
        VILLAINS[best].color,
        1.2,
      );
    }

    this.addFloat(
      this.layout.width / 2,
      this.layout.height * 0.36,
      '收网行动！',
      VILLAINS[best].color,
      30,
      true,
    );

    this.syncAllPositions();
    this.emitHud();

    window.setTimeout(() => {
      this.syncAllPositions();
      this.busy = false;
      this.afterSettle();
    }, 480);

    return true;
  }

  // ------------------------------------------------------------ 尺寸
  private attachResize(): void {
    const onResize = () => this.resizeCanvas();
    window.addEventListener('resize', onResize);
    this.cleanupFns.push(() => window.removeEventListener('resize', onResize));

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    }
  }

  private resizeCanvas(): void {
    const parent = this.canvas.parentElement;
    const width = Math.max(280, parent?.clientWidth ?? this.canvas.clientWidth ?? 360);

    // 关键：用父容器的**实际可用高度**，而不是自己按比例算。
    // 之前用 min(width*ratio, viewport-chrome) 会让画布比容器高，
    // 结果棋盘被挤到下半部分、上方空一大块。
    const parentHeight = parent?.clientHeight ?? 0;
    const height = parentHeight > 120
      ? parentHeight
      : Math.max(300, (typeof window === 'undefined' ? 700 : window.innerHeight) - 200);

    const rows = this.state.board.length;
    const cols = this.state.board[0]?.length ?? 7;

    // 格子尺寸取「宽、高都能放下」的较大值，尽量把可用空间吃满。
    // （之前取宽高比的 min 时，7×7 棋盘在 390×844 的手机上只用掉 364px 高，
    //   剩下 280px 全是黑的，看起来像页面没加载完。）
    const cell = Math.floor(Math.min(width / cols, height / rows));
    const canvasWidth = cell * cols;
    const canvasHeight = cell * rows;

    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(canvasWidth * this.dpr);
    this.canvas.height = Math.round(canvasHeight * this.dpr);
    this.canvas.style.width = `${canvasWidth}px`;
    this.canvas.style.height = `${canvasHeight}px`;

    this.layout = {
      width: canvasWidth,
      height: canvasHeight,
      cell,
      boardX: 0,
      boardY: 0,
    };
  }

  /** 格子坐标 → 像素中心点 */
  private cellCenter(row: number, col: number): { x: number; y: number } {
    const { cell, boardX, boardY } = this.layout;
    return {
      x: boardX + col * cell + cell / 2,
      y: boardY + row * cell + cell / 2,
    };
  }

  /** 像素坐标 → 格子坐标（越界返回 null） */
  private pointToCell(x: number, y: number): Coord | null {
    const { cell, boardX, boardY } = this.layout;
    const col = Math.floor((x - boardX) / cell);
    const row = Math.floor((y - boardY) / cell);
    if (row < 0 || row >= this.state.board.length) return null;
    if (col < 0 || col >= (this.state.board[0]?.length ?? 0)) return null;
    return { row, col };
  }

  // ------------------------------------------------------------ 输入
  private attachInput(): void {
    const toLocal = (e: PointerEvent | Touch): { x: number; y: number } => {
      const rect = this.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      sound.init();
      sound.resume();
      const p = toLocal(e);
      const cell = this.pointToCell(p.x, p.y);
      this.pointerStart = cell ? { x: p.x, y: p.y, cell } : null;
      this.dragCell = cell;
      this.hintTimer = 0;
      this.hint = null;
      if (cell) sound.play('pick');
    };

    const onMove = (e: PointerEvent) => {
      if (!this.pointerStart) return;
      const p = toLocal(e);
      const dx = p.x - this.pointerStart.x;
      const dy = p.y - this.pointerStart.y;
      const threshold = this.layout.cell * 0.34;

      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        // 拖拽交换：只取主导方向
        const dir =
          Math.abs(dx) > Math.abs(dy)
            ? { row: 0, col: dx > 0 ? 1 : -1 }
            : { row: dy > 0 ? 1 : -1, col: 0 };

        const from = this.pointerStart.cell;
        const to = { row: from.row + dir.row, col: from.col + dir.col };
        this.pointerStart = null;
        this.dragCell = null;

        if (this.inBounds(to)) {
          void this.attemptSwap(from, to);
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const p = toLocal(e);
      const start = this.pointerStart;
      this.pointerStart = null;
      this.dragCell = null;
      if (!start) return;

      const cell = this.pointToCell(p.x, p.y);
      if (!cell) return;

      // 点选模式：第一次选中，第二次相邻则交换
      if (!this.selected) {
        this.selected = cell;
        return;
      }

      if (this.selected.row === cell.row && this.selected.col === cell.col) {
        this.selected = null;
        return;
      }

      const from = this.selected;
      this.selected = null;

      if (Math.abs(from.row - cell.row) + Math.abs(from.col - cell.col) === 1) {
        void this.attemptSwap(from, cell);
      } else {
        // 不相邻则改为选中新的
        this.selected = cell;
      }
    };

    const onLeave = () => {
      this.pointerStart = null;
      this.dragCell = null;
    };

    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('pointercancel', onLeave);
    this.canvas.addEventListener('pointerleave', onLeave);
    // 阻止移动端滚动，避免拖拽时页面跟着动
    const preventScroll = (e: TouchEvent) => e.preventDefault();
    this.canvas.addEventListener('touchmove', preventScroll, { passive: false });

    this.cleanupFns.push(() => {
      this.canvas.removeEventListener('pointerdown', onDown);
      this.canvas.removeEventListener('pointermove', onMove);
      this.canvas.removeEventListener('pointerup', onUp);
      this.canvas.removeEventListener('pointercancel', onLeave);
      this.canvas.removeEventListener('pointerleave', onLeave);
      this.canvas.removeEventListener('touchmove', preventScroll);
    });
  }

  private inBounds(coord: Coord): boolean {
    return (
      coord.row >= 0 &&
      coord.row < this.state.board.length &&
      coord.col >= 0 &&
      coord.col < (this.state.board[0]?.length ?? 0)
    );
  }

  // ------------------------------------------------------------ 交换
  /** 跳过当前囚车目标（花一次「非目标消除」换来的机会） */
  skipTarget(): boolean {
    if (this.busy || this.state.phase !== 'idle') return false;
    const result = skipCurrentTarget(this.state);
    if (!result.ok) return false;
    this.state = result.state;
    this.emitHud();
    return true;
  }

  /** 暂停：停掉渲染循环（菜单打开时用） */
  public pause(): void {
    if (this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this.raf);
  }

  /** 恢复：重新起渲染循环 */
  public resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.lastFrame = performance.now();
    this.loop(performance.now());
  }

  private async attemptSwap(from: Coord, to: Coord): Promise<void> {
    if (this.paused) return;
    if (this.busy || this.state.phase !== 'idle') return;
    // 有问答没答完时，棋盘锁住
    if (this.state.pendingQuiz) return;

    // 空位保护（动画中间可能有 null）
    if (!getCell(this.state.board, from.row, from.col) || !getCell(this.state.board, to.row, to.col)) {
      return;
    }

    const before = this.state;
    const { state: after, result } = trySwap(before, from, to);

    if (!result.ok) {
      sound.play('invalid');
      this.busy = true;
      // 抖一下
      this.tweenTileToTile(from, to);
      window.setTimeout(() => {
        this.snapTileToGrid(from);
        this.snapTileToGrid(to);
        this.busy = false;
        this.emitHud();
      }, 150);
      return;
    }

    this.busy = true;
    this.selected = null;
    this.hint = null;

    // 先把「出发位置」写进被交换的两个格子，让它们从旧位置滑过去
    this.setTileMotion(from, from);
    this.setTileMotion(to, to);

    this.state = after;
    sound.play('swap');

    // 播放交换动画
    await this.wait(140);

    // 交换的目标位置（模型已经换好了，这里把 view 对齐）
    this.tweenTileToTile(to, from);
    this.tweenTileToTile(from, to);
    await this.wait(150);
    this.snapTileToGrid(from);
    this.snapTileToGrid(to);

    // 结算
    await this.resolveCascades();

    this.busy = false;
    this.hintTimer = 0;
    this.selected = null;
    this.afterSettle();
  }

  /** 把某个格子的显示起点设成另一个坐标 */
  private setTileMotion(cellAt: Coord, viewAt: Coord): void {
    const tile = getCell(this.state.board, cellAt.row, cellAt.col);
    if (!tile) return;
    tile.viewRow = viewAt.row;
    tile.viewCol = viewAt.col;
    this.tweens.set(tile.id, {
      id: tile.id,
      mode: 'outQuad',
      duration: 150,
      elapsed: 0,
      fromRow: viewAt.row,
      fromCol: viewAt.col,
      toRow: cellAt.row,
      toCol: cellAt.col,
    });
  }

  private tweenTileToTile(cellAt: Coord, viewAt: Coord): void {
    const tile = getCell(this.state.board, cellAt.row, cellAt.col);
    if (!tile) return;
    this.tweens.set(tile.id, {
      id: tile.id,
      mode: 'outQuad',
      duration: 150,
      elapsed: 0,
      fromRow: tile.viewRow,
      fromCol: tile.viewCol,
      toRow: viewAt.row,
      toCol: viewAt.col,
    });
  }

  private snapTileToGrid(coord: Coord): void {
    const tile = getCell(this.state.board, coord.row, coord.col);
    if (!tile) return;
    tile.viewRow = coord.row;
    tile.viewCol = coord.col;
    this.tweens.delete(tile.id);
  }

  /**
   * 把所有格子的显示坐标对齐到网格。
   *
   * 关键细节：不能简单地「清空补间 + 瞬移」。
   * 如果某格已经在往上/往下掉（viewRow 和网格位置差得不多），
   * 瞬移会让一列方块突然跳一下，看起来很廉价。
   * 所以这里只给「偏移很小」的直接对齐，偏移大的补一个短补间，让动画收尾自然。
   */
  private syncAllPositions(): void {
    for (let r = 0; r < this.state.board.length; r += 1) {
      for (let c = 0; c < (this.state.board[r]?.length ?? 0); c += 1) {
        const tile = getCell(this.state.board, r, c);
        if (!tile) continue;
        const nearRow = Math.abs(tile.viewRow - r) < 0.01;
        const nearCol = Math.abs(tile.viewCol - c) < 0.01;
        if (nearRow && nearCol) {
          this.tweens.delete(tile.id);
          tile.viewRow = r;
          tile.viewCol = c;
          continue;
        }
        // 正在掉落的：别硬拽，给 120ms 收尾补间
        this.tweens.set(tile.id, {
          id: tile.id,
          mode: 'outQuad',
          duration: 120,
          elapsed: 0,
          fromRow: tile.viewRow,
          fromCol: tile.viewCol,
          toRow: r,
          toCol: c,
        });
      }
    }
  }

  // ------------------------------------------------------------ 连锁结算
  /**
   * 检查是否该弹问答。
   *
   * 时机：每消除 12 个弹一次。此时棋盘刚结算完，玩家手里没有未完成的动作。
   */
  private maybeQuiz(): void {
    if (!shouldTriggerQuiz(this.state)) return;
    const seed = (Date.now() ^ (this.state.totalCleared * 7919)) >>> 0;
    const { state: next, usedIds } = triggerQuiz(this.state, this.quizUsedIds, seed);
    this.state = next;
    this.quizUsedIds = usedIds;
    this.onQuizUsed?.(usedIds);
    sound.play('combo', 2);
    this.emitHud();
  }

  /** 玩家回答一道题 */
  public answerQuizOption(index: number): {
    granted: { name: string; icon: string; effectText: string; desc: string } | null;
    correct: boolean;
    verdict: { title: string; detail: string; grade: 'good' | 'meh' | 'bad' } | null;
    stars: number;
    gainedScore: number;
    /** 正确选项的下标（答完之后才给 UI，用来高亮） */
    correctIndex: number;
  } {
    const quiz = this.state.pendingQuiz;
    const scoreBefore = this.state.score;
    const chosen = quiz?.options[index];
    // 评价在清空题目之前算，否则拿不到原题
    const verdict = quiz ? judgeAnswer(quiz, index) : null;
    const { state: next, granted } = answerQuiz(this.state, index);
    this.state = next;

    if (granted) {
      sound.play('win');
    } else {
      sound.play('invalid');
    }
    this.emitHud();
    // 星级：答对 3 星，答错 1 星；答对但分数没涨（比如加步数）也给 2 星
    const gained = this.state.score - scoreBefore;
    const stars = chosen?.correct ? (gained > 0 ? 3 : 2) : 1;
    const correctIndex = quiz?.options.findIndex((o) => o.correct) ?? -1;
    return {
      granted,
      correct: chosen?.correct ?? false,
      verdict,
      stars,
      gainedScore: gained,
      correctIndex,
    };
  }

  private async resolveCascades(): Promise<void> {
    const before = this.state;
    const { state: resolved } = resolveStep(before, this.rng);
    this.state = resolved;

    const events = resolved.events;
    if (events.length === 0) {
      this.emitHud();
      return;
    }


    // 按 chain 分组：同一层连锁一起播，视觉上才有「一波一波」的节奏
    const byChain = new Map<number, ComboEvent[]>();
    for (const event of events) {
      const list = byChain.get(event.chain);
      if (list) list.push(event);
      else byChain.set(event.chain, [event]);
    }

    const chains = [...byChain.keys()].sort((a, b) => a - b);

    for (const chain of chains) {
      const chainEvents = byChain.get(chain) ?? [];

      // 1) 闪烁 + 粒子 + 飘字
      for (const event of chainEvents) {
        this.playClearEffect(event);
      }

      sound.play('clear', chain);
      if (chain >= 2) {
        sound.play('combo');
        this.shake = Math.min(12, 3 + chain * 2);
      }

      const totalPoints = chainEvents.reduce((sum, e) => sum + e.points, 0);
      this.comboDisplay = {
        label: chainEvents[0]?.label ?? comboLabel(chain),
        chain,
        points: totalPoints,
      };
      this.comboDisplayTimer = 900;

      this.options.onCombo?.(chainEvents[0] ?? events[0]!);
      this.emitHud();

      await this.wait(230);

      // 2) 掉落：让所有存活格子滑到新位置（核心只更新 view 目标，渲染自动插值）
      this.syncDropTargets();
      await this.wait(300);
    }

    // 3) 收尾：对齐 + 清掉残留的消除态
    for (const row of this.state.board) {
      for (const tile of row) {
        if (tile) {
          tile.state = 'idle';
          tile.scale = 1;
          tile.rotation = 0;
          tile.alpha = 1;
        }
      }
    }
    this.syncAllPositions();
    this.emitHud();

    this.maybeQuiz();
  }

  private playClearEffect(event: ComboEvent): void {
    const def = VILLAINS[event.type];
    const cells = event.cells.slice(0, 24);
    const now = performance.now();

    // 每张被消除的牌都加一个「被扇飞」动画
    for (const coord of cells) {
      const { x, y } = this.cellCenter(coord.row, coord.col);
      // 用坐标做伪随机，保证同一局里飞散方向看起来杂乱但可复现
      const seed = coord.row * 73 + coord.col * 131;
      this.flyingTiles.push({
        x,
        y,
        type: event.type,
        variant: seed % 3,
        startAt: now + Math.random() * 40,
        angle: -Math.PI / 2 + ((seed % 100) / 100 - 0.5) * 1.6,
        fromLeft: seed % 2 === 0,
      });

    }

    // 一记「啪」—— 一组牌只扇一下，避开顶部被裁掉的区域
    sound.play('slap');
    if (cells.length > 0) {
      const cell = this.layout.cell;
      const cx =
        cells.reduce((sum, c) => sum + this.cellCenter(c.row, c.col).x, 0) / cells.length;
      const rawY =
        cells.reduce((sum, c) => sum + this.cellCenter(c.row, c.col).y, 0) / cells.length;
      // 钳到棋盘内，别让手跑到画布外面去
      const cy = Math.min(this.layout.height - cell * 0.7, Math.max(cell * 0.7, rawY));
      this.slapHands.push({
        x: cx,
        y: cy,
        startAt: now,
        fromLeft: false,
        scale: 1.15,
      });
    }

    for (const coord of cells) {
      const { x, y } = this.cellCenter(coord.row, coord.col);
      // 粒子
      for (let i = 0; i < 7; i += 1) {
        this.spawnParticle(x, y, i % 3 === 0 ? '#ffffff' : def.color, 1);
      }
      // 冲击环
      this.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0.32,
        maxLife: 0.32,
        size: this.layout.cell * 0.9,
        color: def.color,
        gravity: 0,
      });
    }

    // 飘字：每次消除飘一个总分，位置取这组格子的中心
    const first = cells[0];
    if (first) {
      const { x, y } = this.cellCenter(first.row, first.col);
      // 只飘分数。连击名字在顶部横幅里已经有了，两处都写会显得脏
      const label = `+${event.points}`;
      this.addFloat(x, y - this.layout.cell * 0.3, label, def.color, event.chain >= 2 ? 22 : 17, event.chain >= 2);
    }
  }

  /**
   * 掉落动画。
   *
   * 模型已经落位（格子都在最终行号上了），但视觉上它们应该「从上面滑下来」。
   * 起点由核心逻辑写在 tile.dropFromRow 里：
   *   · 新生成的格子 = 负数（棋盘上方）
   *   · 被上方消除砸下来的老格子 = 它被压之前的行号
   * 渲染层只需要从 dropFromRow 补间到当前行，掉落感就出来了。
   */
  private syncDropTargets(): void {
    for (let r = 0; r < this.state.board.length; r += 1) {
      for (let c = 0; c < (this.state.board[r]?.length ?? 0); c += 1) {
        const tile = getCell(this.state.board, r, c);
        if (!tile) continue;

        const fromRow = tile.dropFromRow;
        const dropped = fromRow !== undefined && Math.abs(fromRow - r) > 0.01;

        if (dropped) {
          // 距离越远掉得越久，但设个上下限，避免大列看起来拖沓
          const distance = Math.abs(r - fromRow);
          const duration = Math.min(420, 180 + distance * 26);
          this.tweens.set(tile.id, {
            id: tile.id,
            mode: 'inQuad',
            duration,
            elapsed: 0,
            fromRow,
            fromCol: c,
            toRow: r,
            toCol: c,
          });
          tile.viewRow = fromRow;
          tile.viewCol = c;
        } else if (Math.abs(tile.viewRow - r) > 0.001 || Math.abs(tile.viewCol - c) > 0.001) {
          this.tweens.set(tile.id, {
            id: tile.id,
            mode: 'outQuad',
            duration: 180,
            elapsed: 0,
            fromRow: tile.viewRow,
            fromCol: tile.viewCol,
            toRow: r,
            toCol: c,
          });
        }

        tile.state = 'idle';
        tile.dropFromRow = undefined;
      }
    }
  }

  private afterSettle(): void {
    if (this.state.phase === 'won') {
      sound.play('win');
      this.flash = 0.8;
      this.flashColor = '#4ade80';
      this.emitHud();
      this.options.onFinish?.(this.state);
    } else if (this.state.phase === 'lost') {
      sound.play('lose');
      this.emitHud();
      this.options.onFinish?.(this.state);
    } else {
      this.emitHud();
    }
  }

  // ------------------------------------------------------------ 视觉辅助
  private spawnParticle(x: number, y: number, color: string, power: number): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = (60 + Math.random() * 160) * power;
    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
      size: 2 + Math.random() * 4,
      color,
      gravity: 380,
    });
  }

  private addFloat(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
    bold: boolean,
  ): void {
    // 限制在画布内：飘字是从消除位置往上飘的，靠近顶部时会直接飘出画布被裁掉
    const clampedY = Math.min(this.layout.height - 20, Math.max(size + 8, y));
    const clampedX = Math.min(this.layout.width - 40, Math.max(40, x));
    this.floats.push({
      x: clampedX,
      y: clampedY,
      vy: -46,
      life: 1.05,
      maxLife: 1.05,
      text,
      color,
      size,
      bold,
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  // ------------------------------------------------------------ 主循环
  private loop = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000 || 0.016);
    this.lastFrame = now;
    this.time += dt;

    this.update(dt);
    this.render();

    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    /**
     * 倒计时（第 5 关起有）。
     *
     * 用真实时间推进 —— 暂停时 engine.pause() 会停掉整个循环，所以自然冻结。
     * HUD 只在「整秒变化」时刷新，避免每帧 setState 拖慢 React。
     */
    if (this.state.phase === 'idle') {
      const before = this.state.taskTimeLeft + this.state.levelTimeLeft;
      const ticked = tickTimer(this.state, dt);
      if (ticked !== this.state) {
        this.state = ticked;
        const after = this.state.taskTimeLeft + this.state.levelTimeLeft;
        if (Math.ceil(before) !== Math.ceil(after)) this.emitHud();
        if (this.state.phase === 'lost') this.options.onFinish?.(this.state);
      }
    }

    // 补间
    for (const [id, tween] of this.tweens) {
      tween.elapsed += dt * 1000;
      const raw = Math.min(1, tween.elapsed / tween.duration);
      const t = ease(tween.mode, raw);

      // 找到这个 id 对应的格子
      const tile = this.findTileById(id);
      if (!tile) {
        this.tweens.delete(id);
        continue;
      }
      tile.viewRow = tween.fromRow + (tween.toRow - tween.fromRow) * t;
      tile.viewCol = tween.fromCol + (tween.toCol - tween.fromCol) * t;

      if (raw >= 1) {
        tile.viewRow = tween.toRow;
        tile.viewCol = tween.toCol;
        this.tweens.delete(id);
      }
    }

    // 粒子
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // 飘字
    for (let i = this.floats.length - 1; i >= 0; i -= 1) {
      const f = this.floats[i]!;
      f.life -= dt;
      if (f.life <= 0) {
        this.floats.splice(i, 1);
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= 0.97;
    }

    // 推进救援倒计时（只在可操作时走表，播放动画时暂停，避免「看动画被扣血」）
    if (this.state.rescues.length > 0 && this.state.phase === 'idle' && !this.busy) {
      const before = this.state.rescues.map((r) => `${r.status}:${r.danger.toFixed(2)}`).join('|');
      this.state = advanceRescue(this.state, dt);
      const after = this.state.rescues.map((r) => `${r.status}:${r.danger.toFixed(2)}`).join('|');

      this.rescueHudTimer += dt * 1000;
      if (after !== before && this.rescueHudTimer > 80) {
        this.rescueHudTimer = 0;
        this.emitHud();
      }
      // 救援状态变化（成功/失败）要立刻通知，并有音效
      if (after !== before) {
        const justLost = this.state.rescues.some(
          (r, i) => r.status === 'lost' && !before.split('|')[i]?.startsWith('lost'),
        );
        const justRescued = this.state.rescues.some(
          (r, i) => r.status === 'rescued' && !before.split('|')[i]?.startsWith('rescued'),
        );
        if (justLost) {
          this.addFloat(this.layout.width / 2, this.layout.height * 0.3, '救援失败…', '#ff5c7a', 22, true);
          sound.play('invalid');
          this.shake = 8;
          this.emitHud();
        }
        if (justRescued) {
          this.addFloat(this.layout.width / 2, this.layout.height * 0.3, '解救成功！', '#4ade80', 24, true);
          sound.play('win');
          this.flash = 0.5;
          this.flashColor = '#4ade80';
          this.emitHud();
        }
      }
    }

    // 清理已经飞完的牌（飞行动画 0.42 秒）
    const nowMs = performance.now();
    if (this.flyingTiles.length > 0) {
      this.flyingTiles = this.flyingTiles.filter((f) => nowMs - f.startAt < 420);
    }
    if (this.slapHands.length > 0) {
      this.slapHands = this.slapHands.filter((h) => nowMs - h.startAt < 360);
    }

    // 震屏衰减
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 42);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.4);

    // 连击展示计时
    if (this.comboDisplayTimer > 0) {
      this.comboDisplayTimer -= dt * 1000;
      if (this.comboDisplayTimer <= 0) {
        this.comboDisplay = null;
        this.emitHud();
      }
    }

    // 提示
    if (!this.busy && this.state.phase === 'idle' && !this.selected) {
      this.hintTimer += dt * 1000;
      if (this.hintTimer > HINT_DELAY_MS && !this.hint) {
        const found = findHint(this.state.board);
        if (found) this.hint = found;
      }
    } else {
      this.hintTimer = 0;
      this.hint = null;
    }
  }

  private findTileById(id: number) {
    for (const row of this.state.board) {
      for (const tile of row) {
        if (tile && tile.id === id) return tile;
      }
    }
    return null;
  }

  // ------------------------------------------------------------ 渲染
  private render(): void {
    const ctx = this.ctx;
    const { width, height, cell, boardX, boardY } = this.layout;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // 背景：奶油色 → 浅暖色（亮色系）
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#fff9f0');
    bg.addColorStop(1, '#fdf2e3');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // 网格微光
    const rows = this.state.board.length;
    const cols = this.state.board[0]?.length ?? 7;
    ctx.save();
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)';
        ctx.fillRect(boardX + c * cell, boardY + r * cell, cell, cell);
      }
    }
    ctx.strokeStyle = 'rgba(214, 190, 160, 0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, boardX + 1, boardY + 1, cell * cols - 2, cell * rows - 2, 18);
    ctx.stroke();
    ctx.restore();

    // 震屏
    ctx.save();
    if (this.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    // 提示高亮
    if (this.hint) {
      const pulse = 0.35 + 0.35 * Math.sin(this.time * 6);
      for (const coord of [this.hint.a, this.hint.b]) {
        const { x, y } = this.cellCenter(coord.row, coord.col);
        ctx.save();
        ctx.strokeStyle = `rgba(249, 115, 22, ${pulse + 0.2})`;
        ctx.lineWidth = 3;
        roundRect(ctx, x - cell / 2 + 4, y - cell / 2 + 4, cell - 8, cell - 8, cell * 0.18);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 选中高亮
    if (this.selected) {
      const { x, y } = this.cellCenter(this.selected.row, this.selected.col);
      ctx.save();
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.95)';
      ctx.lineWidth = 4;
      roundRect(ctx, x - cell / 2 + 3, y - cell / 2 + 3, cell - 6, cell - 6, cell * 0.18);
      ctx.stroke();
      ctx.restore();
    }

    // 格子
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const tile = getCell(this.state.board, r, c);
        if (!tile) continue;
        this.drawTile(tile, r, c);
      }
    }

    // 粒子
    for (const p of this.particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = alpha;
      if (p.vx === 0 && p.vy === 0) {
        // 冲击环
        const progress = 1 - p.life / p.maxLife;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.3 + progress * 0.9), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const sprite = this.sprites.getDisc(p.color, Math.max(2, p.size * 2.4));
        ctx.drawImage(sprite, p.x - p.size * 1.2, p.y - p.size * 1.2, p.size * 2.4, p.size * 2.4);
      }
      ctx.globalAlpha = 1;
    }

    // 被扇飞的牌 + 扇过来的手
    for (const f of this.flyingTiles) {
      const p = Math.min(1, (performance.now() - f.startAt) / 420);
      if (p < 0) continue;

      const cell = this.layout.cell;
      // 飞出：沿 angle 方向加速冲出去，同时快速旋转
      const dist = p * p * cell * 6;
      const fx = f.x + Math.cos(f.angle) * dist;
      const fy = f.y + Math.sin(f.angle) * dist;
      const rotation = p * 14 * (f.angle > 0 ? 1 : -1);
      const scale = 1 + p * 0.25;
      const alpha = p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.4);

      // 拖影（让速度感更强）
      if (p > 0.05 && p < 0.85) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.25;
        for (let k = 1; k <= 2; k += 1) {
          const trailDist = (p - k * 0.06) * (p - k * 0.06) * cell * 6;
          if (trailDist < 0) continue;
          const tx = f.x + Math.cos(f.angle) * trailDist;
          const ty = f.y + Math.sin(f.angle) * trailDist;
          const sprite = this.sprites.getTile(f.type, Math.round(cell * 0.94), false, 1, f.variant);
          ctx.drawImage(
            sprite,
            tx - (cell * scale) / 2,
            ty - (cell * scale) / 2,
            cell * scale,
            cell * scale,
          );
        }
        ctx.restore();
      }

      // 本体
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(fx, fy);
      ctx.rotate(rotation);
      const sprite = this.sprites.getTile(f.type, Math.round(cell * 0.94), false, 1, f.variant);
      ctx.drawImage(sprite, (-cell * scale) / 2, (-cell * scale) / 2, cell * scale, cell * scale);
      ctx.restore();

      // 冲击波 + 星星（每张牌各有一点，但很小）
      if (p > 0.06 && p < 0.5) {
        drawSlapImpact(ctx, f.x, f.y, cell * 0.7, Math.min(1, p * 2.4), Math.max(0, 1 - p * 2.0) * 0.7);
      }
    }

    // 扇巴掌的手：一组牌扇一下
    for (const hand of this.slapHands) {
      const age = performance.now() - hand.startAt;
      const p = age / 340;
      if (p < 0 || p > 1) continue;
      // 0-0.35 快速扫入 → 到位（啪）→ 0.8 之后淡出
      const handP = Math.min(1, p / 0.35);
      const handAlpha = p < 0.78 ? 1 : Math.max(0, 1 - (p - 0.78) / 0.22);
      const cell = this.layout.cell;
      const dir = hand.fromLeft ? -1 : 1;
      drawSlapHand(ctx, hand.x, hand.y, cell * hand.scale, handP, handAlpha, dir);
    }

    // 漂浮的文字
    for (const f of this.floats) {
      const alpha = Math.max(0, Math.min(1, f.life / f.maxLife));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `${f.bold ? '800' : '700'} ${f.size}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }

    ctx.restore();

    // 连击横幅
    if (this.comboDisplay) {
      const { width: w } = this.layout;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.comboDisplayTimer / 250);
      // 横幅固定画在画布最顶部（棋盘上方），绝不压住棋子
      const bannerY = 30;
      const text = `${this.comboDisplay.label} ×${this.comboDisplay.chain}`;
      ctx.font = '800 22px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeText(text, w / 2, bannerY);
      ctx.fillStyle = '#f97316';
      ctx.fillText(text, w / 2, bannerY);
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.strokeText(`+${this.comboDisplay.points}`, w / 2, bannerY + 22);
      ctx.fillStyle = '#3f3a35';
      ctx.fillText(`+${this.comboDisplay.points}`, w / 2, bannerY + 22);
      ctx.restore();
    }

    // 全屏闪光
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.flash * 0.35;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  private drawTile(tile: NonNullable<ReturnType<typeof getCell>>, r: number, c: number): void {
    const ctx = this.ctx;
    const { cell } = this.layout;
    const { x, y } = this.cellCenter(tile.viewRow, tile.viewCol);

    /**
     * 当前囚车目标的颜色：在棋子上加一圈呼吸光圈。
     *
     * 顺序囚车最关键的是「现在该抓什么」，如果只在顶部面板标出来，
     * 玩家的视线在棋盘上时根本注意不到。所以直接把提示放到棋盘上。
     */
    const target = currentTarget(this.state);
    if (target && target.type === tile.type && tile.state === 'idle') {
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 5);
      ctx.save();
      ctx.globalAlpha = pulse * 0.85;
      ctx.strokeStyle = VILLAINS[tile.type].color;
      ctx.lineWidth = Math.max(2.5, cell * 0.075);
      roundRect(ctx, x - cell / 2 + 3, y - cell / 2 + 3, cell - 6, cell - 6, cell * 0.28);
      ctx.stroke();
      ctx.restore();
    }

    // 消除动画：放大后缩小消失
    let scale = tile.scale;
    let alpha = tile.alpha;
    let rotation = tile.rotation;
    if (tile.state === 'clearing') {
      const p = Math.min(1, (this.time * 1000) % 1000);
      scale = tile.scale * (1 + p * 0.35);
      alpha = Math.max(0, 1 - p);
      rotation = tile.rotation + p * 0.4;
    }

    const sprite = this.sprites.getTile(
      tile.type,
      Math.round(cell * 0.94),
      tile.poisoned,
      tile.hp,
      tile.variant ?? 0,
    );
    const size = cell * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(rotation);
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    ctx.restore();

    // 拖动中：轻微上浮
    if (this.dragCell && this.dragCell.row === r && this.dragCell.col === c) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      roundRect(ctx, x - cell / 2 + 3, y - cell / 2 + 3, cell - 6, cell - 6, cell * 0.18);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ HUD
  private emitHud(): void {
    const s = this.state;
    const seq = sequenceProgress(s);
    const target = currentTarget(s);

    // 连击横幅里也展示提示（让 React 侧能显示，而不只是 canvas 上）
    this.options.onHud({
      score: s.score,
      movesLeft: s.movesLeft,
      rage: s.rage,
      rageMax: s.rageMax,
      phase: s.phase,
      sequence: seq.map((p) => ({
        type: p.step.type,
        name: VILLAINS[p.step.type].name,
        color: VILLAINS[p.step.type].color,
        state: p.state,
        current: p.current,
        need: p.need,
      })),
      targetType: target?.type ?? null,
      offTargetCleared: s.offTargetCleared,
      taskTimeLeft: s.taskTimeLeft,
      levelTimeLeft: s.levelTimeLeft,
      taskTimeTotal: s.level.taskTimerSeconds ?? 0,
      levelTimeTotal: s.level.levelTimerSeconds ?? 0,
      skipsLeft: Math.floor(s.offTargetCleared / 5) - s.skipsUsed,
      combo: this.comboDisplay,
      maxChain: s.maxChain,
      totalCleared: s.totalCleared,
      stars: computeStars(s),
      seed: s.seed,
      canSweep: s.rage >= s.rageMax && s.phase === 'idle' && s.sweepUsed < s.modeConfig.sweepLimit,
      mode: s.mode,
      modeName: s.modeConfig.name,
      sweepUsed: s.sweepUsed,
      sweepLimit: s.modeConfig.sweepLimit,
      pendingQuiz: s.pendingQuiz
        ? {
            prompt: s.pendingQuiz.prompt,
            bossName: VILLAINS[s.pendingQuiz.from ?? s.level.types[0] ?? 'pua'].name,
            bossType: s.pendingQuiz.from ?? s.level.types[0] ?? 'pua',
            // 注意：不把 correct 暴露给 UI，否则等于把答案告诉玩家
            options: s.pendingQuiz.options.map((o) => ({ text: o.text, reaction: o.reaction })),
          }
        : null,
      overall: (() => {
        // 顺序囚车：总进度 = 已抓完的隔间数 + 当前隔间的进度
        const total = s.level.targetSequence.reduce((a, x) => a + Math.max(1, x.need), 0);
        const done = s.level.targetSequence
          .slice(0, s.seqIndex)
          .reduce((a, x) => a + Math.max(1, x.need), 0);
        const current = Math.min(total, done + s.seqProgress);
        return { current, total, ratio: total === 0 ? 1 : current / total };
      })(),
      rescues: s.rescues.map((r) => ({
        id: r.id,
        name: r.name,
        situation: r.situation,
        type: r.type,
        typeName: VILLAINS[r.type].name,
        progress: r.progress,
        needed: r.needed,
        danger: r.danger,
        status: r.status,
        avatar: r.avatar,
        dangerSeconds: r.dangerSeconds,
      })),
    });
  }

  /** 给 React 用的本局摘要 */
  getSummary() {
    return summarize(this.state);
  }

  getState(): GameState {
    return this.state;
  }

  /**
   * 自动化测试探针（仅供 e2e 脚本使用）。
   *
   * 暴露棋盘快照和「一步可行解」，这样测试脚本不用靠盲点，
   * 也能验证「核心认为可以交换 → 实际交换后确实扣步得分」这条链路。
   * 不暴露任何会破坏游戏性的能力（不能直接改状态）。
   */
  debugSnapshot() {
    const board = this.state.board.map((row) =>
      row.map((cell) => (cell ? { type: cell.type, hp: cell.hp, poisoned: cell.poisoned } : null)),
    );
    return {
      board,
      hint: findHint(this.state.board),
      seqIndex: this.state.seqIndex,
      seqProgress: this.state.seqProgress,
      offTargetCleared: this.state.offTargetCleared,
      taskTimeLeft: this.state.taskTimeLeft,
      levelTimeLeft: this.state.levelTimeLeft,
      movesLeft: this.state.movesLeft,
      score: this.state.score,
      phase: this.state.phase,
      busy: this.busy,
      layout: this.layout,
      boardSize: { rows: this.state.board.length, cols: this.state.board[0]?.length ?? 0 },
      mode: this.state.mode,
      rescues: this.state.rescues.map((r) => ({
        name: r.name,
        type: r.type,
        progress: r.progress,
        needed: r.needed,
        danger: r.danger,
        status: r.status,
      })),
      rage: this.state.rage,
      sweepUsed: this.state.sweepUsed,
    };
  }

  hasWon(): boolean {
    return goalsMet(this.state);
  }
}

// ---------------------------------------------------------------- 缓动
function ease(mode: Tween['mode'], t: number): number {
  switch (mode) {
    case 'linear':
      return t;
    case 'outQuad':
      return 1 - (1 - t) * (1 - t);
    case 'inQuad':
      return t * t;
    case 'outBack': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
    }
    default:
      return t;
  }
}

export type { Board };
