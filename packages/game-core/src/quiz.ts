/**
 * 职场问答 —— 答题拿「工具」
 *
 * 玩法：
 *   游戏进行到一定进度时，领导突然冒出来说一句话（挑衅 / PUA / 甩锅），
 *   给你 3 个回应。选对了就拿到一件「工具」，立刻生效。
 *
 * 为什么这个设计能救「消除很无聊」：
 *   消除本身是纯机械的（凑三个），但「被领导点名 → 当场怼回去 → 拿到工具」
 *   是一个有情绪回报的插入事件，它打断了机械流程。
 *
 * 内容规则（用户明确要求）：
 *   1. 每一条都是一次性的
 *   2. 随机抽取，同一关不同人遇到的题不一样
 *   3. 答过的不再出现
 *
 * 实现方式：
 *   · 内容池有 30 条，每局按 seed 洗牌后按顺序取
 *   · 已答过的 id 存 localStorage，跨局也不再出现
 *   · 池子用完了就重置（保证长期可玩）
 */

import type { VillainType } from './types.ts';

// ---------------------------------------------------------------- 工具
export type ToolEffect =
  | { kind: 'moves'; amount: number }
  | { kind: 'score'; amount: number }
  | { kind: 'rage'; amount: number }
  /** 清掉最满的一整行 */
  | { kind: 'clearRow' }
  /** 清掉最满的一整列 */
  | { kind: 'clearCol' }
  /** 清一行 + 一列（十字） */
  | { kind: 'clearCross' }
  /** 随机清 N 个 */
  | { kind: 'clearRandom'; amount: number };

export interface Tool {
  /** 唯一 id */
  id: string;
  /** 工具名 */
  name: string;
  /** 一句话说明 */
  desc: string;
  /** 图标（emoji，省得再画图） */
  icon: string;
  effect: ToolEffect;
}

export const TOOLS: Record<string, Tool> = {
  // ---- 直接「制服」领导的几件大杀器
  chiefVisit: {
    id: 'chiefVisit',
    name: '上级领导突击检查',
    desc: '大领导突然推门进来，他所有的话术当场作废 —— 清掉一整行',
    icon: '🚪',
    effect: { kind: 'clearRow' },
  },
  discipline: {
    id: 'discipline',
    name: '纪检部门进驻',
    desc: '查到他收受供应商好处，一整条线的人都被带走 —— 清掉一整列',
    icon: '🔍',
    effect: { kind: 'clearCol' },
  },
  arbitration: {
    id: 'arbitration',
    name: '劳动仲裁开庭',
    desc: '仲裁员一到，他和你同时被叫进去，整层楼都停下来看 —— 清一行加一列',
    icon: '⚖️',
    effect: { kind: 'clearCross' },
  },
  pressExpose: {
    id: 'pressExpose',
    name: '媒体曝光',
    desc: '记者堵在楼下，他连夜删聊天记录 —— 随机清掉 8 个',
    icon: '📰',
    effect: { kind: 'clearRandom', amount: 8 },
  },

  // ---- 加分型
  lawyer: {
    id: 'lawyer',
    name: '律师函',
    desc: '不用真发，放在他桌上让他看见就够了',
    icon: '📄',
    effect: { kind: 'score', amount: 900 },
  },
  payslip: {
    id: 'payslip',
    name: '同行工资单',
    desc: '「隔壁给我开的比这儿高 40%」',
    icon: '💰',
    effect: { kind: 'score', amount: 700 },
  },
  headhunter: {
    id: 'headhunter',
    name: '猎头名片',
    desc: '不小心掉在他办公室门口',
    icon: '📇',
    effect: { kind: 'score', amount: 600 },
  },

  // ---- 资源型
  recorder: {
    id: 'recorder',
    name: '录音笔',
    desc: '把他刚才说的话录下来了',
    icon: '🎙️',
    effect: { kind: 'moves', amount: 3 },
  },
  coffee: {
    id: 'coffee',
    name: '续命咖啡',
    desc: '喝完还能再战两小时',
    icon: '☕',
    effect: { kind: 'moves', amount: 2 },
  },
  unionRep: {
    id: 'unionRep',
    name: '工会代表',
    desc: '「这事我们得按流程来」—— 大家的火气都上来了',
    icon: '🤝',
    effect: { kind: 'rage', amount: 50 },
  },
};

// ---------------------------------------------------------------- 问答
export interface QuizOption {
  text: string;
  /** 是否正确（选对了才给工具） */
  correct: boolean;
  /** 领导的反应 */
  reaction: string;
}

export interface Quiz {
  id: string;
  /** 出题的领导类型（null = 任意） */
  from: VillainType | null;
  /** 领导说的话 */
  prompt: string;
  options: QuizOption[];
  /** 答对给的奖励工具 id */
  reward: string;
}

/**
 * 题库：24 条，全部围绕「被领导当场点名」的场景。
 *
 * 每条只有一个正确答案，另外两个是常见但吃亏的回应：
 *   一个是「认怂」，一个是「和稀泥」。
 * 这样玩家答题时能学到「原来这么说才不吃亏」。
 */
export const QUIZZES: Quiz[] = [
  {
    id: 'q01',
    from: 'pua',
    prompt: '你最近是不是有点不在状态？我看你准点就走了。',
    options: [
      { text: '对不起，我最近确实放松了，我调整一下。', correct: false, reaction: '他点点头：「年轻人要自觉。」' },
      { text: '我的工作都按时交付了。准时下班不叫不在状态。', correct: true, reaction: '他张了张嘴，最后说了句「行吧」。' },
      { text: '最近事情有点多，我尽量快一点。', correct: false, reaction: '「那就是效率问题。」他记下了。' },
    ],
    reward: 'recorder',
  },
  {
    id: 'q02',
    from: 'shirk',
    prompt: '这个方案当初谁定的？现在出问题了吧。',
    options: [
      { text: '是您在上上周的会上拍板的，纪要里有。', correct: true, reaction: '他翻了翻纪要，没再说话。' },
      { text: '是我们组一起讨论的。', correct: false, reaction: '「那就是你们组的问题。」' },
      { text: '我再去确认一下是谁定的。', correct: false, reaction: '「不用确认了，就你吧。」' },
    ],
    reward: 'discipline',
  },
  {
    id: 'q03',
    from: 'grafter',
    prompt: '这次汇报我来讲吧，你讲容易讲不清楚。',
    options: [
      { text: '好的，那我整理一份讲稿发给您。', correct: false, reaction: '他拿着你的讲稿上了台。' },
      { text: '这个方案我做了三周，我讲最清楚。要不我讲，您在旁边补充？', correct: true, reaction: '他愣了一下，说「那你讲吧」——语气不太高兴，但没理由反对。' },
      { text: '那辛苦您了。', correct: false, reaction: '「不辛苦，这是团队的事。」' },
    ],
    reward: 'headhunter',
  },
  {
    id: 'q04',
    from: 'overtime',
    prompt: '今晚这个必须弄完，你没问题吧？',
    options: [
      { text: '没问题，我加班弄。', correct: false, reaction: '「这才是我们团队的风格。」' },
      { text: '可以，那我明天上午调休，走个审批。', correct: true, reaction: '他犹豫了一下：「调休……回头再说。」但你没再让。' },
      { text: '尽量吧。', correct: false, reaction: '「尽量就是没问题的意思。」' },
    ],
    reward: 'pressExpose',
  },
  {
    id: 'q05',
    from: 'formalist',
    prompt: '这个事你怎么没走流程？',
    options: [
      { text: '对不起，我补一下流程。', correct: false, reaction: '「下次注意。」流程又多了一版。' },
      { text: '流程是三步，我按前两步做了，第三步要您审批——就是现在。', correct: true, reaction: '他咳嗽了一声，把审批点了。' },
      { text: '我不知道要走流程。', correct: false, reaction: '「不知道就该问。」' },
    ],
    reward: 'arbitration',
  },
  {
    id: 'q06',
    from: 'pua',
    prompt: '我当年在你这个年纪，已经带团队了。',
    options: [
      { text: '您真厉害，我还要多学习。', correct: false, reaction: '他满意地笑了。' },
      { text: '那您现在带的团队，离职率怎么样？', correct: true, reaction: '他的笑容僵在脸上。' },
      { text: '时代不一样了。', correct: false, reaction: '「时代变了，人不能变。」' },
    ],
    reward: 'payslip',
  },
  {
    id: 'q07',
    from: 'shirk',
    prompt: '这个数据怎么和我记得的不一样？',
    options: [
      { text: '我核对过三遍，是这个数。', correct: true, reaction: '「那可能是我记错了。」他难得认了一次。' },
      { text: '那我再核一遍。', correct: false, reaction: '「对，再核一遍。」你白干两小时。' },
      { text: '可能哪里出错了吧。', correct: false, reaction: '「那就是你的问题。」' },
    ],
    reward: 'discipline',
  },
  {
    id: 'q08',
    from: 'grafter',
    prompt: '这个想法不错，是我上次提的那个方向吧？',
    options: [
      { text: '是受您启发。', correct: false, reaction: '「对，就是我那个方向。」' },
      { text: '不是，这是我上周在周报里写的，可以查记录。', correct: true, reaction: '他摆摆手：「记错了记错了。」' },
      { text: '有点关系，但也有我自己的东西。', correct: false, reaction: '「那就是我那个方向。」' },
    ],
    reward: 'headhunter',
  },
  {
    id: 'q09',
    from: 'overtime',
    prompt: '周末有个急活，你来一下吧？',
    options: [
      { text: '好的，我周六过来。', correct: false, reaction: '「辛苦了，记你一次功劳。」没有然后。' },
      { text: '可以，按公司规定周末是双倍工资，流程走一下？', correct: true, reaction: '他沉默了一会儿：「……那我自己来吧。」' },
      { text: '我周末有事。', correct: false, reaction: '「什么事比工作重要？」' },
    ],
    reward: 'pressExpose',
  },
  {
    id: 'q10',
    from: 'formalist',
    prompt: '这个需求先写个方案，评审通过再做。',
    options: [
      { text: '好的，我这周写方案。', correct: false, reaction: '方案写完，需求变了。' },
      { text: '方案大概两页够吗？还是我先做一版原型，评审时更快？', correct: true, reaction: '他想了想：「原型……也行。」你省了两周。' },
      { text: '这个需求很简单，不用方案吧。', correct: false, reaction: '「简单才更要方案。」' },
    ],
    reward: 'lawyer',
  },
  {
    id: 'q11',
    from: null,
    prompt: '你觉得公司现在最大的问题是什么？说实话。',
    options: [
      { text: '我觉得挺好的，没什么问题。', correct: false, reaction: '「你这个人不够坦诚。」' },
      { text: '人手不够，很多事只能做到及格。', correct: true, reaction: '他没接话，但你在场的人都记住了这句。' },
      { text: '这个……我不太方便说。', correct: false, reaction: '「没事，随便聊聊。」他记了一笔。' },
    ],
    reward: 'unionRep',
  },
  {
    id: 'q12',
    from: 'pua',
    prompt: '你要学会站在公司的角度看问题。',
    options: [
      { text: '我还年轻，请您多指点。', correct: false, reaction: '「这就对了。」' },
      { text: '我站在公司的角度看了，所以才提这个问题。', correct: true, reaction: '他一时没接上来。' },
      { text: '我会努力的。', correct: false, reaction: '「努力是应该的。」' },
    ],
    reward: 'payslip',
  },
  {
    id: 'q13',
    from: 'shirk',
    prompt: '上次那个问题，我不是让你跟进了吗？',
    options: [
      { text: '对不起，我马上跟。', correct: false, reaction: '锅又落回你身上。' },
      { text: '您说的是哪一次？我怕记错，想确认一下。', correct: true, reaction: '他想了半天，发现确实没说过。' },
      { text: '我以为您会跟。', correct: false, reaction: '「我让你跟，怎么变成我跟了？」' },
    ],
    reward: 'discipline',
  },
  {
    id: 'q14',
    from: 'grafter',
    prompt: '这次奖金是按团队发的，不单独给你。',
    options: [
      { text: '好的，理解。', correct: false, reaction: '团队里只有他拿了。' },
      { text: '按团队发没问题，那发放明细能不能公开给团队看？', correct: true, reaction: '他皱眉：「这个……要走流程。」' },
      { text: '那我这部分是多少？', correct: false, reaction: '「还没算。」' },
    ],
    reward: 'arbitration',
  },
  {
    id: 'q15',
    from: 'overtime',
    prompt: '你最近下班都不打招呼就走，这让别人怎么想？',
    options: [
      { text: '下次我注意。', correct: false, reaction: '从此你每天都要说一声「我走了」。' },
      { text: '我的下班时间是六点，公司制度上写着。', correct: true, reaction: '他没再提这件事。' },
      { text: '我看大家都没走，我就没敢说。', correct: false, reaction: '「对啊，别人都在。」' },
    ],
    reward: 'lawyer',
  },
  {
    id: 'q16',
    from: 'formalist',
    prompt: '这次的周报怎么没写够 500 字？',
    options: [
      { text: '我这周做的事不多，写不出 500 字。', correct: false, reaction: '「那就是你没事干。」' },
      { text: '周报是为了同步信息，不是凑字数。我这周的三件事都写清楚了。', correct: true, reaction: '他看了看那三条，确实清楚。' },
      { text: '我下次多写点。', correct: false, reaction: '下周你写了 800 字废话。' },
    ],
    reward: 'coffee',
  },
  {
    id: 'q17',
    from: null,
    prompt: '你觉得自己今年能评上优秀员工吗？',
    options: [
      { text: '我觉得有机会。', correct: false, reaction: '「嗯，那你继续努力。」' },
      { text: '我今年的产出和数据都在这，评价标准如果公开，我可以对照一下。', correct: true, reaction: '他第一次正面回答：「标准确实该公开。」' },
      { text: '评不上也没关系。', correct: false, reaction: '「那就不努力了？」' },
    ],
    reward: 'unionRep',
  },
  {
    id: 'q18',
    from: 'pua',
    prompt: '年轻人不要太计较眼前得失。',
    options: [
      { text: '您说得对。', correct: false, reaction: '他满意了。' },
      { text: '我不计较得失，我计较的是承诺有没有兑现。', correct: true, reaction: '他沉默了。' },
      { text: '我也是没办法。', correct: false, reaction: '「没办法就忍着。」' },
    ],
    reward: 'payslip',
  },
  {
    id: 'q19',
    from: 'shirk',
    prompt: '这个锅不能都让你背，你先顶一下，我后面想办法。',
    options: [
      { text: '好的，我先顶着。', correct: false, reaction: '他后面没想办法。' },
      { text: '可以顶，但要在邮件里写清楚分工，方便以后对齐。', correct: true, reaction: '他不敢写。' },
      { text: '我顶不了。', correct: false, reaction: '「那你这态度有问题。」' },
    ],
    reward: 'recorder',
  },
  {
    id: 'q20',
    from: 'grafter',
    prompt: '你要多向团队里其他人学习，特别是汇报能力。',
    options: [
      { text: '好的，我多向您学习。', correct: false, reaction: '「这就对了。」' },
      { text: '汇报能力我确实要练，正好下个季度我想主讲一次。', correct: true, reaction: '他想推，但这是当着人说的。' },
      { text: '我汇报能力还行吧。', correct: false, reaction: '「你这就是听不进去意见。」' },
    ],
    reward: 'headhunter',
  },
  {
    id: 'q21',
    from: 'overtime',
    prompt: '楼下有免费咖啡，当作给你们的福利了。',
    options: [
      { text: '谢谢领导！', correct: false, reaction: '咖啡换加班，赚了。' },
      { text: '谢谢。不过比起咖啡，大家可能更想要调休。', correct: true, reaction: '旁边有人点头，他看见了。' },
      { text: '嗯，挺好的。', correct: false, reaction: '「那就这样定了。」' },
    ],
    reward: 'coffee',
  },
  {
    id: 'q22',
    from: 'formalist',
    prompt: '你这个月的复盘报告，格式不对。',
    options: [
      { text: '哪里不对？我改。', correct: false, reaction: '他说了三条，你没听懂任何一条。' },
      { text: '格式规范能发我一份吗？我按最新的来。', correct: true, reaction: '他发现自己也没有最新规范。' },
      { text: '我一直这么写的。', correct: false, reaction: '「所以才说你不专业。」' },
    ],
    reward: 'lawyer',
  },
  {
    id: 'q23',
    from: null,
    prompt: '如果公司现在让你降薪 20%，你能接受吗？',
    options: [
      { text: '可以接受，我理解公司难处。', correct: false, reaction: '他真的降了。' },
      { text: '可以接受，那我们先把公司的亏损数据拿出来一起看，如果确实困难，我可以。', correct: true, reaction: '他笑了：「开玩笑的。」' },
      { text: '不能接受。', correct: false, reaction: '「那你考虑一下。」' },
    ],
    reward: 'chiefVisit',
  },
  {
    id: 'q24',
    from: 'pua',
    prompt: '说实话，你在这里是幸运的，外面很多人想进来。',
    options: [
      { text: '是，我很珍惜。', correct: false, reaction: '「那就多想想。」' },
      { text: '那确实是。不过外面也有很多地方在招同样的人，工资还高一点。', correct: true, reaction: '他第一次没接话。' },
      { text: '外面也不一定好。', correct: false, reaction: '「对，所以你要珍惜。」' },
    ],
    reward: 'recorder',
  },
];

// ---------------------------------------------------------------- 抽题
/**
 * 从题库里抽一题，排除掉已经答过的。
 *
 * 用户的要求是「一次性 + 随机 + 不重复」：
 *   · 一次性：答过的 id 进 usedIds，不再出现
 *   · 随机：用 seed 洗牌，同一关不同玩家顺序不同
 *   · 不重复：抽之前先过滤掉 usedIds
 *
 * 池子抽空了就清空 usedIds 重新开始（否则老玩家会没题）。I
 */
export function drawQuiz(seed: number, usedIds: string[]): { quiz: Quiz; usedIds: string[] } {
  const pool = QUIZZES.filter((q) => !usedIds.includes(q.id));
  const fresh = pool.length > 0 ? pool : QUIZZES;
  const base = pool.length > 0 ? usedIds : [];

  // 线性同余洗牌：用 seed 决定顺序
  const arr = [...fresh];
  let s = seed >>> 0 || 1;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }

  const quiz = arr[0]!;
  return { quiz, usedIds: [...base, quiz.id] };
}

/**
 * 判断一个选项的性质。
 *
 * 「correct」只能说明对错，但玩家想知道的是**我这句说得硬不硬**。
 * 所以拆成三种：反杀 / 和稀泥 / 认怂。
 */
export function optionTone(quiz: Quiz, index: number): 'counter' | 'neutral' | 'submit' {
  const opt = quiz.options[index];
  if (opt?.correct) return 'counter';
  const firstWrong = quiz.options.findIndex((o) => !o.correct);
  return index === firstWrong ? 'submit' : 'neutral';
}

/** 这次回答的评价 */
export interface Verdict {
  tone: 'counter' | 'neutral' | 'submit';
  title: string;
  detail: string;
  /** 好 = 绿，中 = 黄，差 = 红 */
  grade: 'good' | 'meh' | 'bad';
}

export function judgeAnswer(quiz: Quiz, index: number): Verdict {
  const tone = optionTone(quiz, index);
  if (tone === 'counter') {
    return {
      tone,
      title: '将了他一军',
      detail: '这话他接不住，只能干咳一声。',
      grade: 'good',
    };
  }
  if (tone === 'submit') {
    return {
      tone,
      title: '被压下去了',
      detail: '你认了，他就赢了。下一次他还会这么说。',
      grade: 'bad',
    };
  }
  return {
    tone,
    title: '被绕过去了',
    detail: '不算输，但也没占到便宜。',
    grade: 'meh',
  };
}

/** 工具查表 */
export function getTool(id: string): Tool | null {
  return TOOLS[id] ?? null;
}

/** 这个效果的中文描述（结算页 / 提示用） */
export function describeEffect(effect: ToolEffect): string {
  switch (effect.kind) {
    case 'moves':
      return `+${effect.amount} 步`;
    case 'score':
      return `+${effect.amount} 分`;
    case 'rage':
      return `怒值 +${effect.amount}%`;
    case 'clearRandom':
      return `随机清掉 ${effect.amount} 个`;
    case 'clearRow':
      return '清掉一整行';
    case 'clearCol':
      return '清掉一整列';
    case 'clearCross':
      return '清掉一行加一列';
  }
}
