/**
 * 职场话术库 —— 这个游戏的「灵魂」
 *
 * 为什么这是灵魂：
 *   消除只是动作，真正让人有代入感的是「这些话我听过」。
 *   失败时被 PUA 一句，胜利时把领导将一军——这才是打工人想要的情绪出口。
 *
 * 写作原则：
 *   1. 全部是真实职场话术的浓缩，不夸张到失真
 *   2. 反杀选项要有「真的能说出口」的锋利感，但不能脏
 *   3. 不指向任何真实人物或公司
 */

import type { VillainType } from './types.ts';

// ---------------------------------------------------------------- 失败时
/**
 * 闯关失败时随机弹一句领导的 PUA。
 *
 * 设计意图：让失败**不那么挫败**，而是变成「又听到这句了」的会心一笑。
 * 玩家输的时候看到这个，会想「我就是要打赢你」。
 */
export interface PuaLine {
  /** 谁说的（对应 boss 类型，null = 通用） */
  from: VillainType | null;
  text: string;
  /** 潜台词（小字，增加信息量和讽刺感） */
  subtext: string;
}

export const PUA_LINES: PuaLine[] = [
  {
    from: 'pua',
    text: '年轻人不要总盯着工资，要看重成长。',
    subtext: '潜台词：成长是你的，钱是我的。',
  },
  {
    from: 'pua',
    text: '我这个位置，当年也是这么熬过来的。',
    subtext: '潜台词：我熬过，所以你也得熬。',
  },
  {
    from: 'shirk',
    text: '这个事我不是早就交代过你吗？',
    subtext: '潜台词：不管交没交代，锅都是你的。',
  },
  {
    from: 'shirk',
    text: '你先把方案做个初稿，不对我们再改。',
    subtext: '潜台词：改到第 18 版的时候，他会说「一开始就是这个方向」。',
  },
  {
    from: 'grafter',
    text: '这个项目是团队一起做的，不要突出个人。',
    subtext: '潜台词：领奖的时候突出我。',
  },
  {
    from: 'grafter',
    text: '你能有今天，还不是因为平台给了你机会？',
    subtext: '潜台词：你做的所有事，都归平台。',
  },
  {
    from: 'overtime',
    text: '反正你一个人住，回去也是玩手机。',
    subtext: '潜台词：你的时间不值钱。',
  },
  {
    from: 'overtime',
    text: '我当年连续三个月没休过周末，你们现在条件好多了。',
    subtext: '潜台词：我被剥削过，你也得被剥削。',
  },
  {
    from: 'formalist',
    text: '先做个周报把进度同步一下，我们再讨论。',
    subtext: '潜台词：讨论可以没有结果，但周报不能没有。',
  },
  {
    from: 'formalist',
    text: '这个流程要走完，不然不合规。',
    subtext: '潜台词：合规是为了免责，不是为了做事。',
  },
  {
    from: null,
    text: '公司就是你的家。',
    subtext: '潜台词：家里加班不用给钱。',
  },
  {
    from: null,
    text: '你这个能力，出去也不好找工作。',
    subtext: '潜台词：所以要留下来，继续被我 PUA。',
  },
];

/** 抽一句和当前 boss 类型匹配（或通用）的 PUA */
export function pickPuaLine(type: VillainType | null, seed: number): PuaLine {
  const pool = PUA_LINES.filter((l) => l.from === type || l.from === null);
  const idx = Math.abs(Math.floor(seed)) % Math.max(1, pool.length);
  return pool[idx] ?? PUA_LINES[0]!;
}

// ---------------------------------------------------------------- 通关时
/**
 * 通关时的「话术对决」。
 *
 * 流程：领导先说一句挑衅 → 玩家从 3 个应对里选一个 → 给出反馈和奖励。
 * 这是整个游戏最爽的时刻，所以文案必须够劲。
 */
export interface RetortOption {
  /** 你说的话 */
  text: string;
  /** 这个选项的性质 */
  tone: 'submit' | 'neutral' | 'counter';
  /** 领导的反应 */
  reaction: string;
  /** 额外得分 */
  bonus: number;
}

export interface Showdown {
  /** 哪个领导 */
  boss: VillainType;
  /** 领导说的话 */
  taunt: string;
  /** 三个应对方案 */
  options: RetortOption[];
}

export const SHOWDOWNS: Record<VillainType, Showdown> = {
  pua: {
    boss: 'pua',
    taunt: '这个方向我早就想过了，只是还没来得及说。',
    options: [
      {
        text: '那您真是高瞻远瞩，连我做的都能提前想到。',
        tone: 'submit',
        reaction: '……你还挺会说话。（+0）',
        bonus: 0,
      },
      {
        text: '想过了但没说，等于没想。',
        tone: 'counter',
        reaction: '他沉默了三秒，说「你这个态度要改改」——但你知道他答不上来。（+80）',
        bonus: 80,
      },
      {
        text: '嗯，我记下了。',
        tone: 'neutral',
        reaction: '他点点头，觉得自己又赢了一局。（+20）',
        bonus: 20,
      },
    ],
  },
  shirk: {
    boss: 'shirk',
    taunt: '这个事我不是交代过你吗？你怎么老是这样。',
    options: [
      {
        text: '对不起，是我理解错了。',
        tone: 'submit',
        reaction: '「知道就好，下次注意。」锅稳稳落地。（+0）',
        bonus: 0,
      },
      {
        text: '交代过的话，聊天记录里应该有，我现在找找？',
        tone: 'counter',
        reaction: '他手忙脚乱地说「算了算了，先干活」，然后快步走了。（+80）',
        bonus: 80,
      },
      {
        text: '下次我会跟您确认得更清楚一点。',
        tone: 'neutral',
        reaction: '「嗯，这就对了。」（+20）',
        bonus: 20,
      },
    ],
  },
  grafter: {
    boss: 'grafter',
    taunt: '这个项目是我带着做的，你要多学着点。',
    options: [
      {
        text: '是是是，全靠您指导。',
        tone: 'submit',
        reaction: '他满意地拍了拍你的肩。（+0）',
        bonus: 0,
      },
      {
        text: '那这周那三个线上 bug，也麻烦您带着修一下？',
        tone: 'counter',
        reaction: '他愣了两秒，说「这个……你们先看」，然后转身进了会议室。（+80）',
        bonus: 80,
      },
      {
        text: '团队合作嘛，都有贡献。',
        tone: 'neutral',
        reaction: '「对，团队合作。」他说着，把署名改成了自己。（+20）',
        bonus: 20,
      },
    ],
  },
  overtime: {
    boss: 'overtime',
    taunt: '反正你也没什么事吧？这个今晚弄完。',
    options: [
      {
        text: '好的，我加班弄。',
        tone: 'submit',
        reaction: '「这才是我们团队的精神。」（+0）',
        bonus: 0,
      },
      {
        text: '有事，我要回去睡觉，这也是正事。',
        tone: 'counter',
        reaction: '他张了张嘴，最后说「那你明天早点来」。（+80）',
        bonus: 80,
      },
      {
        text: '我看看能不能安排出时间。',
        tone: 'neutral',
        reaction: '「那就是能。」他替你做了决定。（+20）',
        bonus: 20,
      },
    ],
  },
  formalist: {
    boss: 'formalist',
    taunt: '先做个周报汇报一下进度，我们再往下推进。',
    options: [
      {
        text: '好的，我马上做。',
        tone: 'submit',
        reaction: '「记得加上数据图表，领导喜欢看。」（+0）',
        bonus: 0,
      },
      {
        text: '周报能推进项目吗？还是我直接做，做完您看结果？',
        tone: 'counter',
        reaction: '他犹豫了一下：「也行……但过程要留痕。」你说「我录屏」。他没话了。（+80）',
        bonus: 80,
      },
      {
        text: '我先整理一下再发您。',
        tone: 'neutral',
        reaction: '「好，越快越好。」（+20）',
        bonus: 20,
      },
    ],
  },
};

/** 抽一个对应领导的 showdown */
export function pickShowdown(boss: VillainType): Showdown {
  return SHOWDOWNS[boss];
}

/** 这场对决里最高分的选项（UI 用来标「最佳」） */
export function showdownBest(showdown: Showdown): number {
  return Math.max(...showdown.options.map((o) => o.bonus));
}

// ---------------------------------------------------------------- 救援者
/** 被救下来的打工人（出现在救援卡上） */
export interface VictimProfile {
  name: string;
  situation: string;
}

export const VICTIMS: Record<VillainType, VictimProfile[]> = {
  pua: [
    { name: '小林', situation: '入职两年，工资没涨，饼吃了三张' },
    { name: '阿May', situation: '被说"再熬一熬就是核心骨干"' },
  ],
  shirk: [
    { name: '大刘', situation: '上个月的锅还在他背上' },
    { name: '小周', situation: '刚被叫去"聊聊最近的表现"' },
  ],
  grafter: [
    { name: '陈工', situation: '方案是他写的，汇报是他领导去的' },
    { name: '阿杰', situation: '连续三年的优秀员工都不是他' },
  ],
  overtime: [
    { name: '小美', situation: '已经连上 12 天班，工位有张折叠床' },
    { name: '老王', situation: '孩子发烧那天，他还在改需求' },
  ],
  formalist: [
    { name: '林姐', situation: '一天开了六个会，一件正事没做' },
    { name: '阿强', situation: '周报写了 8000 字，项目原地踏步' },
  ],
};

export function pickVictim(type: VillainType, seed: number): VictimProfile {
  const pool = VICTIMS[type];
  const idx = Math.abs(Math.floor(seed)) % Math.max(1, pool.length);
  return pool[idx] ?? pool[0]!;
}
