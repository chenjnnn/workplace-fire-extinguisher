/**
 * 游戏核心类型定义
 *
 * 设计原则：这个文件里的东西**不许 import 任何浏览器 API**。
 * 小程序阶段把渲染层换掉，core 一行都不用改。
 */

// ---------------------------------------------------------------- 坏人类型
/**
 * 五种「坏领导」—— 这是游戏的代入感来源。
 *
 * 为什么用「职场坏领导」而不是「诈骗犯/毒贩」：
 *   抽象的社会恶人离玩家太远，而「被画饼、被甩锅、被抢功、被逼加班、被表格折磨」
 *   是打工人每天都在经历的。消除他们才有真实的解压感。
 *
 * 每个类型都对应一种具体的职场伤害，机制也呼应这种伤害：
 *   甩锅侠会「甩锅」污染相邻格，抢功精要「清两次」才倒。
 */
export type VillainType = 'pua' | 'shirk' | 'grafter' | 'overtime' | 'formalist' | 'flatterer';

export interface VillainDef {
  type: VillainType;
  /** 中文名 */
  name: string;
  /** 一句话标签，结算页和科普卡用 */
  tagline: string;
  /** 主色（霓虹） */
  color: string;
  /** 深色，用于阴影和描边 */
  dark: string;
  /** 消除该类型时涨多少「怒」 */
  rage: number;
  /** 基础分 */
  baseScore: number;
  /** 需要消几次才倒（1 = 一次） */
  hp: number;
  /**
   * 特殊机制说明（仅用于 UI 提示与文档，逻辑在 game.ts 里实现）
   */
  mechanic: string;
}

export const VILLAINS: Record<VillainType, VillainDef> = {
  pua: {
    type: 'pua',
    name: '画饼王',
    tagline: '"年轻人要看长远，别总盯着钱"',
    color: '#06b6d4',
    dark: '#0e7490',
    rage: 1,
    baseScore: 30,
    hp: 1,
    mechanic: '基础型：天天给你画饼，就是不涨工资',
  },
  shirk: {
    type: 'shirk',
    name: '甩锅侠',
    tagline: '"这个事我不是交代过你吗？"',
    color: '#65a30d',
    dark: '#3f6212',
    rage: 2,
    baseScore: 45,
    hp: 1,
    mechanic: '基础型：出事第一句话就是「这个事我不是交代过你吗」',
  },
  grafter: {
    type: 'grafter',
    name: '抢功精',
    tagline: '"这个项目是我带着做的"',
    color: '#f59e0b',
    dark: '#b45309',
    rage: 2,
    baseScore: 60,
    hp: 2,
    mechanic: '抢你的功，要清两次才倒（第一次只是丢了 PPT）',
  },
  overtime: {
    type: 'overtime',
    name: '加班魔',
    tagline: '"反正你也没什么事吧？"',
    color: '#f43f5e',
    dark: '#be123c',
    rage: 1,
    baseScore: 35,
    hp: 1,
    mechanic: '被打掉时会反咬一口，扣分（不扣步数）',
  },
  flatterer: {
    type: 'flatterer',
    name: '马屁精',
    tagline: '"领导说得对，我完全同意"',
    color: '#f472b6',
    dark: '#be185d',
    rage: 1,
    baseScore: 40,
    hp: 1,
    mechanic: '基础型：对上一套对下一套，专抢你汇报的机会',
  },
  formalist: {
    type: 'formalist',
    name: '形式怪',
    tagline: '"先做个周报汇报一下进度"',
    color: '#a855f7',
    dark: '#7e22ce',
    rage: 3,
    baseScore: 80,
    hp: 1,
    mechanic: '一层套一层，消除后十字爆裂，把他那堆表格全掀了',
  },
};

export const VILLAIN_ORDER: VillainType[] = [
  'pua',
  'shirk',
  'grafter',
  'overtime',
  'formalist',
  'flatterer',
];

/**
 * 游戏模式
 *
 * normal    ：标准难度，有救援压力
 * catharsis ：解恨模式 —— 更爽、更解压
 *             · 连锁倍数更高、怒值攒得更快
 *             · 收网行动不限次数
 *             · 救援计时更宽松（甚至不失败）
 *             · 特效更夸张
 *             仍然保留规则完整性，只是「让玩家赢」
 */
export type GameMode = 'normal' | 'catharsis';

export interface ModeConfig {
  mode: GameMode;
  name: string;
  tagline: string;
  /** 连锁倍数上限 */
  chainCap: number;
  /** 每点怒值需求的缩减比例（0.6 = 只攒 60% 就满） */
  rageFactor: number;
  /** 收网行动可用次数上限（Infinity = 不限） */
  sweepLimit: number;
  /** 救援危险值上涨速度倍率（0.5 = 慢一半） */
  dangerRate: number;
  /** 救援失败是否扣评价 */
  penaltyOnRescueFail: boolean;
  /** 棋盘上每种坏人的数量权重（1 = 标准） */
  density: number;
}

export const MODE_CONFIGS: Record<GameMode, ModeConfig> = {
  normal: {
    mode: 'normal',
    name: '普通模式',
    tagline: '有压力，才够劲',
    chainCap: 2.6,
    rageFactor: 1,
    sweepLimit: 2,
    dangerRate: 1,
    penaltyOnRescueFail: true,
    density: 1,
  },
  catharsis: {
    mode: 'catharsis',
    name: '解恨模式',
    tagline: '今天不生气，只想痛快',
    chainCap: 4,
    rageFactor: 0.55,
    sweepLimit: Number.POSITIVE_INFINITY,
    dangerRate: 0.45,
    penaltyOnRescueFail: false,
    density: 1.15,
  },
};

/**
 * 待救援的人 —— 这是「上方小动画 + 倒计时」的数据模型
 *
 * 设计关键：倒计时涨满 = 救援失败 = 扣评价，**不是直接 game over**。
 * 原因：10 秒内完不成任务就判负，玩家只会觉得游戏在跟自己作对。
 */
export interface RescueTarget {
  id: string;
  /** 谁需要被救 */
  name: string;
  /** 一句话处境 */
  situation: string;
  /** 需要清除的坏人类型 */
  type: VillainType;
  /** 需要清除的数量 */
  needed: number;
  /** 当前已清除数量 */
  progress: number;
  /** 危险值 0-1，涨满即救援失败 */
  danger: number;
  /** 危险值涨满所需秒数 */
  dangerSeconds: number;
  status: 'active' | 'rescued' | 'lost';
  /** 受害者形象（用捏人的同一套参数，保证风格统一） */
  avatar: AvatarConfig;
}

// ---------------------------------------------------------------- 格子
/**
 * 一个格子（tile）。
 * 带 id 是为了做动画：掉落时渲染层按 id 找上一帧的位置做插值。
 */
export interface Tile {
  id: number;
  type: VillainType;
  /** 剩余血量（贪官 = 2） */
  hp: number;
  /** 是否被毒雾污染（毒雾格要再消一次） */
  poisoned: boolean;
  /** 渲染状态 */
  state: 'idle' | 'spawning' | 'clearing';
  /** 动画用：当前显示位置（格坐标，可为小数） */
  viewRow: number;
  viewCol: number;
  /** 动画用：缩放 */
  scale: number;
  /** 动画用：旋转（弧度） */
  rotation: number;
  /** 动画用：透明度 */
  alpha: number;
  /**
   * 掉落起点（核心在结算时写入，渲染层据此播「从上面滑下来」）。
   * 新生成的格子是负数（在棋盘上方），被压下去的老格子是原行号。
   */
  dropFromRow?: number;
  /**
   * 视觉变体编号（0/1/2）。
   *
   * 只影响长相，**不参与匹配**：诈骗犯的「电话/短信/二维码」三种形象
   * 在规则上完全相同。这样既满足「一种角色多种形象」的丰富度，
   * 又不会破坏三消的核心辨识度（玩家只需要认颜色和轮廓）。
   */
  variant?: number;
}

export type Cell = Tile | null;

/** 棋盘：rows × cols，null 表示空位（正在播放动画） */
export type Board = Cell[][];

export interface Coord {
  row: number;
  col: number;
}

// ---------------------------------------------------------------- 关卡
/**
 * 关卡目标
 *
 * 目前支持两种：
 *   · 指定类型（收集目标）：清掉 N 个某某领导
 *   · 'any'（清除目标）：清掉 N 个任意领导，谁都可以
 *
 * 为什么只做两种而不做五种：
 *   救援落底、订单、清冰块需要新的棋盘元素（可掉落的受害者、可覆盖的冰层），
 *   属于独立的机制模块，硬塞进这一轮会做得很糙。留到下一轮单独做。
 */
export interface LevelGoal {
  /** 要清掉的类型；'any' = 任意类型（清除目标） */
  type: VillainType | 'any';
  /** 需要数量 */
  count: number;
  /** 目标类型的中文标签（'any' 时用） */
  label?: string;
}

/** 关卡场景：给玩家一个「我在哪儿、要干什么」的具体画面 */
export interface LevelScene {
  /** 场景名（会议室 / 工位 / 茶水间 …） */
  name: string;
  /** 一段画面描写，让玩家进入情境 */
  desc: string;
  /** 任务简报：这一关要做什么 */
  mission: string;
  /** 领导在这个场景里说的第一句话（开场动画用） */
  line: string;
}

export interface LevelConfig {
  id: number;
  name: string;
  subtitle: string;
  /** 本关的默认场景 */
  scene: LevelScene;
  /**
   * 额外的场景变体（随机挑一个用）。
   *
   * 用户要求「每个用户玩到相同的关卡，遇到的场景不一样」，
   * 所以同一关准备了多套场景 + 任务，进关时随机选。
   */
  sceneVariants?: LevelScene[];
  rows: number;
  cols: number;
  /** 本关出现的坏人类型（3-5 种，越少越简单） */
  types: VillainType[];
  /** 步数上限 */
  moves: number;
  /**
   * 囚车任务链：按顺序列出要抓的颜色。
   *
   * 每个元素只是颜色，**不带数量** —— 消掉一次就算完成这一格。
   *
   * 为什么这么设计：
   *   带数量时玩家会算「还差几只」，注意力在数字上；
   *   不带数量时注意力回到「现在该抓什么颜色」，链本身就成了节奏。
   *   难度改由「链多长、给多少步、给多少时间、棋盘好不好凑」共同决定。
   */
  targetChain: VillainType[];
  /** 过关最低分数（星级线依次为 minScore / 2星线 / 3星线） */
  minScore: number;
  starScores: [number, number, number];
  /**
   * 每种颜色在棋盘上的出现权重（不填 = 全部 1）。
   *
   * 用户的要求：「难度的调整不仅仅是改时间，更是修改方格中对应颜色能够消到的难易程度」。
   * 把当前目标色的权重调低，它就出得更少、更难凑三连；
   * 非目标色的权重相对变高，干扰更强。
   *
   * 注意：引擎有保底机制（目标色不足 3 个时补块偏向它），
   * 所以权重只影响「平均难度」，不会真的卡死。
   */
  typeWeights?: Partial<Record<VillainType, number>>;
  /**
   * 收网积分的计算方式。
   *
   * 'score'    —— 只要分数涨就算攒（第 1-10 关）
   * 'limited'  —— 只有「完成任务前 3 次非目标消除」的分数才算攒
   *               （第 11 关起，防止玩家靠一直消别的颜色刷收网、跳过全部任务）
   */
  sweepMode?: 'score' | 'limited';
  /**
   * 收网的激活分数（两次）。
   *
   * 用户的要求：「设计一个分数，完成多少分之后第一次激活，完成多少分之后第二次激活」。
   * 所以每关最多能跳过两格，两次门槛逐关抬高。
   */
  sweepThresholds?: [number, number];
  /**
   * 每个囚车间隔的倒计时（秒）。不填 = 这一关没有任务倒计时。
   *
   * 每抓完一个隔间会重置。倒计时归零 = 这个领导跑了 = 整关失败。
   * 用于第 5-10 关：逼玩家在「等一下更好的机会」和「现在就动手」之间选。
   */
  taskTimerSeconds?: number;
  /**
   * 整关倒计时（秒）。不填 = 没有整关倒计时。
   *
   * 和 taskTimerSeconds 互斥（同时填时以整关倒计时为准）。
   * 用于第 10 关之后的关卡。
   */
  levelTimerSeconds?: number;
  /** 特殊规则 */
  rules?: {
    /** 每 N 步，随机一格变成毒雾 */
    poisonEveryMoves?: number;
    /** 恶霸数量倍率 */
    overtimeRate?: number;
  };
  /**
   * 待救援的人（可选）。
   * 有这一项就会在棋盘上方显示救援场景 + 倒计时。
   */
  rescues?: Array<{
    name: string;
    situation: string;
    type: VillainType;
    needed: number;
    dangerSeconds: number;
  }>;
}

// ---------------------------------------------------------------- 游戏状态
export type GamePhase =
  /** 等待玩家操作 */
  | 'idle'
  /** 正在播放交换动画 */
  | 'swapping'
  /** 正在结算消除/掉落/连锁 */
  | 'resolving'
  /** 通关 */
  | 'won'
  /** 失败（步数用尽未达标） */
  | 'lost';

export interface ComboEvent {
  /** 连锁层数，从 1 开始 */
  chain: number;
  /** 本次消除的格子数 */
  cleared: number;
  /** 本次得分 */
  points: number;
  /** 文案，例如「连锅端 ×3」 */
  label: string;
  /** 消除的坐标（给渲染层做粒子） */
  cells: Coord[];
  type: VillainType;
  /** 这一手被加班魔反咬扣掉的分（0 = 没扣） */
  bitten?: number;
  /** 发生在第几步 */
  move: number;
  /**
   * 事件类型：
   *   clear  普通消除
   *   depart 押送车装满发车（渲染层要播更强的特效）
   *   sweep  收网行动
   */
  kind?: 'clear' | 'depart' | 'sweep';
}

export interface GameState {
  level: LevelConfig;
  board: Board;
  phase: GamePhase;
  score: number;
  movesLeft: number;
  /** 怒值 */
  rage: number;
  /** 怒值上限 */
  rageMax: number;
  /** 各类型已清除数量 */
  clearedCount: Record<VillainType, number>;
  /** 当前连锁层数（结算过程中有效） */
  chain: number;
  /** 最大连锁（结算页展示） */
  maxChain: number;
  /** 本局所有连锁事件（渲染层消费后要清空） */
  events: ComboEvent[];
  /** 本局清理总数 */
  totalCleared: number;
  /** 提示格（无操作 5 秒后出现） */
  hint: { a: Coord; b: Coord } | null;
  /** 棋盘被重排过几次 */
  reshuffles: number;
  /** 随机种子，便于复现与每日挑战 */
  seed: number;
  /** 本局是否已用「收网行动」 */
  sweepUsed: number;
  /** 游戏模式 */
  mode: GameMode;
  /** 模式配置 */
  modeConfig: ModeConfig;
  /** 待救援的人（可能为空数组） */
  rescues: RescueTarget[];
  /** 待回答的问答（null = 当前没有） */
  pendingQuiz: import('./quiz.ts').Quiz | null;
  /** 已经答过多少题（用于判断下一次该不该弹） */
  quizzesTaken: number;
  /** 当前隔间的剩余秒数（0 = 没有任务倒计时） */
  taskTimeLeft: number;
  /** 整关剩余秒数（0 = 没有整关倒计时） */
  levelTimeLeft: number;
  /**
   * 已经超时过几次。
   *
   * 用户定的规则：第一次超时扣 2 步、重置计时器，第二次超时才判负。
   * 这样「目标色一直不来」不会一次就前功尽弃。
   */
  timeoutsUsed: number;
  /**
   * 本局实际游玩用时（秒）。
   *
   * 只在「能操作」的时候累加（暂停、弹窗、奖励卡都不算），
   * 所以它是真实的「这一关花了多久」—— 后续做排行榜直接用这个值。
   */
  elapsedSeconds: number;
  /** 当前正在抓第几个隔间（0 开始） */
  seqIndex: number;
  /** 当前隔间已经抓了几只 */
  seqProgress: number;
  /** 非目标色消除的累计数（每满 5 个可以「跳过当前目标」） */
  offTargetCleared: number;
  /**
   * 用于收网积分的分数。
   *
   * 和 score 分开：limited 模式下，连续消非目标色超过 3 次后，
   * 分数照常涨，但**不再计入这里** —— 这样就没法靠刷无关颜色攒跳过了。
   */
  sweepScore: number;
  /** 当前任务期间，已经连续消了几次非目标色（完成任务时清零） */
  offTargetStreak: number;
  /**
   * 连续完成任务的次数（中间不能有任何非任务操作）。
   *
   * 2 次 → 分数奖励；4 次 → 步数奖励。跳过和消非目标色都会打断它。
   */
  taskStreak: number;
  /**
   * 待展示的奖励卡（给 UI 用）。
   * 引擎写入后由界面取走显示，玩家关掉卡片再继续。
   */
  pendingReward: {
    kind: 'score' | 'moves';
    amount: number;
    /** 达到这个连击数时发的 */
    streak: number;
  } | null;
  /** 已经跳过了几次 */
  skipsUsed: number;
  /** 整局累计的救援结果，给结算页用 */
  rescuedCount: number;
  lostCount: number;
  /** 救援失败扣掉的评价分 */
  rescuePenalty: number;
}

export interface SwapResult {
  ok: boolean;
  reason?: 'not_adjacent' | 'no_match' | 'busy' | 'same_cell' | 'out_of_bounds' | 'game_over';
}

// ---------------------------------------------------------------- 捏人
export type Gender = 'male' | 'female' | 'neutral';
export type HairStyle = 'bald' | 'short' | 'slick' | 'mohawk' | 'bowl' | 'bun' | 'long';
export type FaceShape = 'round' | 'square' | 'long' | 'sharp';
export type Expression = 'smug' | 'sly' | 'angry' | 'fake_smile' | 'neutral';
export type Outfit = 'suit' | 'office_casual' | 'uniform' | 'robe';
export type Accessory = 'none' | 'glasses' | 'sunglasses' | 'mustache' | 'cigar' | 'briefcase' | 'moneybag';
export type BrowStyle = 'normal' | 'thick' | 'arched' | 'angry';

/**
 * 用户捏出来的「虚构领导」形象。
 *
 * 注意：这里刻意**只保留固定枚举**，没有任何自由输入字段（姓名、照片、文字），
 * 这是为了从机制上避免生成真实人物肖像 —— 详见 docs/DESIGN.md。
 */
export interface AvatarConfig {
  gender: Gender;
  hair: HairStyle;
  hairColor: string;
  face: FaceShape;
  expression: Expression;
  outfit: Outfit;
  outfitColor: string;
  accessory: Accessory;
  brow: BrowStyle;
  /** 肤色 */
  skin: string;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  gender: 'neutral',
  hair: 'slick',
  hairColor: '#2b2b3a',
  face: 'square',
  expression: 'smug',
  outfit: 'suit',
  outfitColor: '#2f3b52',
  accessory: 'sunglasses',
  brow: 'thick',
  skin: '#f0c9a6',
};

export const AVATAR_OPTIONS = {
  gender: [
    ['male', '男'],
    ['female', '女'],
    ['neutral', '中性'],
  ] as const,
  hair: [
    ['slick', '大背头'],
    ['short', '板寸'],
    ['bowl', '西瓜头'],
    ['mohawk', '鸡冠头'],
    ['bun', '丸子头'],
    ['long', '长发'],
    ['bald', '秃顶'],
  ] as const,
  hairColor: ['#2b2b3a', '#6b4a2f', '#c9a227', '#b23a48', '#8a8a9a', '#e8e8ef'] as const,
  face: [
    ['square', '国字脸'],
    ['round', '圆脸'],
    ['long', '长脸'],
    ['sharp', '尖下巴'],
  ] as const,
  expression: [
    ['smug', '得意'],
    ['sly', '阴险'],
    ['angry', '暴怒'],
    ['fake_smile', '假笑'],
    ['neutral', '面瘫'],
  ] as const,
  outfit: [
    ['suit', '西装'],
    ['office_casual', '衬衫'],
    ['uniform', '制服'],
    ['robe', '长袍'],
  ] as const,
  outfitColor: ['#2f3b52', '#1f1f23', '#7a2431', '#2d5b4a', '#4a3b6b', '#6b5230'] as const,
  accessory: [
    ['none', '无'],
    ['glasses', '金丝眼镜'],
    ['sunglasses', '墨镜'],
    ['mustache', '小胡子'],
    ['cigar', '雪茄'],
    ['briefcase', '公文包'],
    ['moneybag', '钱袋'],
  ] as const,
  brow: [
    ['normal', '平眉'],
    ['thick', '浓眉'],
    ['arched', '挑眉'],
    ['angry', '怒眉'],
  ] as const,
  skin: ['#f0c9a6', '#e0b08c', '#c98d63', '#a86b45', '#7d4f30'] as const,
} as const;
