/**
 * 关卡配置
 *
 * 难度曲线设计原则：
 *   1. 前 3 关只教机制，几乎不会输
 *   2. 每 5 关引入一个新坏人类型
 *   3. 目标从「一种类型」逐步变成「两种类型」
 *   4. 步数从宽松收紧，但始终留有余量（目标 85% 玩家能过）
 */

import type { LevelConfig, LevelScene, VillainType } from './types.ts';

const BASE_TYPES: VillainType[] = ['pua', 'overtime', 'grafter'];

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: '入职第一周',
    subtitle: '第一天就被告知要把公司当自己家',
    scene: {
      name: '入职培训室',
      desc: '第一天，HR 带你参观完工位，把你领进一间没有窗户的培训室。投影仪上循环播放着「我们是一家人」。',
      mission: '在你会被同化之前，先把「公司就是你家」这种话说出口的人打出去。',
      line: '以后这里就是你的家，有什么事都可以跟我说。',
    },
    sceneVariants: [
      {
        name: '工位区',
        desc: '你的工位在打印机旁边。隔壁的老员工趁着没人，低声跟你说了一句：「这里说的话，别都信。」',
        mission: '把那个到处宣讲「家文化」的人从这一层赶出去。',
        line: '我们公司不养闲人，但也不会亏待自己人。',
      },
    ],
    rows: 7,
    cols: 7,
    types: ['pua', 'shirk', 'overtime', 'grafter'],
    moves: 8,
    targetSequence: [
      { type: 'pua', need: 1 },
      { type: 'pua', need: 1 },
      { type: 'pua', need: 1 },
    ],
    minScore: 3200,
    starScores: [3200, 5600, 8200],
    rescues: [
      {
        name: '小林',
        situation: '入职两年，工资没涨，饼吃了三张',
        type: 'pua',
        needed: 20,
        dangerSeconds: 20,
      },
    ],
  },
  {
    id: 2,
    name: '周一早会',
    subtitle: '说好的十分钟，开了两小时',
    scene: {
      name: '会议室',
      desc: '周一九点，全组被叫进会议室。说好十分钟的会，投影仪还在连不上，已经过去四十分钟。',
      mission: '趁他还在讲「上周的复盘」，把画饼王从会上扇出去。',
      line: '大家简单说一下，每个人五分钟，不要超时。',
    },
    sceneVariants: [
      {
        name: '茶水间',
        desc: '早会临时改到茶水间开，因为会议室被另一个会占了。有人站着，有人靠着咖啡机，没人敢坐下。',
        mission: '在咖啡凉掉之前，把画饼王从这场会里请出去。',
        line: '站着开效率高，大家克服一下。',
      },
    ],
    rows: 7,
    cols: 7,
    types: ['pua', 'shirk', 'overtime', 'grafter'],
    moves: 10,
    targetSequence: [
      { type: 'pua', need: 1 },
      { type: 'pua', need: 1 },
      { type: 'shirk', need: 1 },
      { type: 'shirk', need: 1 },
    ],
    minScore: 2400,
    starScores: [2400, 3900, 5600],
    rescues: [
      {
        name: '小林',
        situation: '被说"再熬一熬就是骨干"，熬了两年',
        type: 'pua',
        needed: 12,
        dangerSeconds: 26,
      },
      {
        name: '大刘',
        situation: '上个月的锅还背在身上',
        type: 'shirk',
        needed: 12,
        dangerSeconds: 28,
      },
    ],
  },
  {
    id: 3,
    name: '项目冲刺',
    subtitle: '需求还在加，deadline 没变',
    scene: {
      name: '工位区',
      desc: '凌晨十一点，工位区只剩几盏灯。需求文档又更新了第 18 版，deadline 一天没动。',
      mission: '在需求再变之前，把逼着大家加班的人扇走。',
      line: '这个需求今天下班前能给我吗？不难吧？',
    },
    sceneVariants: [
      {
        name: '测试机房',
        desc: '测试机房的空调坏了，风扇对着服务器吹，人也跟着吹。上线时间还是今晚十二点。',
        mission: '在上线之前，把那个只会加需求的人清出去。',
        line: '这个改动很小，加一下不影响上线吧？',
      },
    ],
    rows: 7,
    cols: 7,
    types: ['pua', 'shirk', 'overtime', 'grafter', 'formalist'],
    moves: 11,
    targetSequence: [
      { type: 'pua', need: 1 },
      { type: 'pua', need: 1 },
      { type: 'overtime', need: 1 },
      { type: 'overtime', need: 1 },
      { type: 'shirk', need: 1 },
    ],
    minScore: 2800,
    starScores: [2800, 4400, 6400],
    rescues: [
      {
        name: '小美',
        situation: '连上 12 天班，工位有张折叠床',
        type: 'overtime',
        needed: 18,
        dangerSeconds: 22,
      },
    ],
  },
  {
    id: 4,
    name: '季度汇报',
    subtitle: '你的活，他的 PPT',
    scene: {
      name: '大会议室',
      desc: '季度汇报，你做的方案被投在屏幕上，站在台上讲的人不是你。',
      mission: '把抢功精从台上扇下来，让你的名字回到署名栏。',
      line: '这个项目是我们团队一起做的，我来汇报。',
    },
    sceneVariants: [
      {
        name: '报告厅',
        desc: '季度汇报在报告厅，台下坐着大老板。你的名字在 PPT 最后一页的「感谢」里。',
        mission: '让他当着所有人的面，把署名改回来。',
        line: '这次汇报时间紧，我就代表团队讲了。',
      },
    ],
    rows: 7,
    cols: 7,
    types: ['pua', 'shirk', 'overtime', 'grafter', 'formalist'],
    moves: 13,
    targetSequence: [
      { type: 'grafter', need: 1 },
      { type: 'grafter', need: 1 },
      { type: 'formalist', need: 1 },
      { type: 'formalist', need: 1 },
      { type: 'overtime', need: 1 },
      { type: 'overtime', need: 1 },
      { type: 'pua', need: 1 },
      { type: 'pua', need: 1 },
    ],
    minScore: 4800,
    starScores: [4800, 8200, 14000],
    rescues: [
      {
        name: '陈工',
        situation: '方案他写的，汇报领导去的',
        type: 'grafter',
        needed: 18,
        dangerSeconds: 24,
      },
    ],
  },
  {
    id: 5,
    name: '年度述职',
    subtitle: '要写 20 页，讲 5 分钟',
    scene: {
      name: '述职厅',
      desc: '年度述职。要求写 20 页 PPT，讲 5 分钟。台下的人都在改自己的稿子。',
      mission: '把那些只会走流程、不看内容的人清出去。',
      line: '内容其实不重要，PPT 要做得好看一点。',
    },
    sceneVariants: [
      {
        name: '打印间',
        desc: '述职材料要彩打 20 份。打印间的机器卡纸了三次，你蹲在地上把纸一张张抽出来。',
        mission: '把那些只数页数、不看内容的人清出去。',
        line: '页数不够，显得我们不重视。',
      },
    ],
    rows: 8,
    cols: 7,
    types: ['pua', 'shirk', 'overtime', 'grafter', 'formalist'],
    moves: 12,
    taskTimerSeconds: 40,
    targetSequence: [
      { type: 'pua', need: 1 },
      { type: 'pua', need: 1 },
      { type: 'shirk', need: 1 },
      { type: 'shirk', need: 1 },
      { type: 'grafter', need: 1 },
      { type: 'grafter', need: 1 },
    ],
    minScore: 5800,
    starScores: [5800, 7800, 9500],
    rescues: [
      {
        name: '林姐',
        situation: '一天开六个会，正事没做',
        type: 'pua',
        needed: 16,
        dangerSeconds: 24,
      },
      {
        name: '阿杰',
        situation: '三年的优秀员工都不是他',
        type: 'shirk',
        needed: 16,
        dangerSeconds: 26,
      },
    ],
    rules: { poisonEveryMoves: 6 },
  },
  {
    id: 6,
    name: '团建当天',
    subtitle: '周六早上八点集合，算自愿',
    scene: {
      name: '郊区团建基地',
      desc: '周六早上八点，大巴停在公司楼下。通知上写着「自愿参加」，但没有一个人不来。',
      mission: '在「破冰游戏」开始之前，把组织这场团建的人打飞。',
      line: '周六早上八点楼下集合，算自愿参加啊。',
    },
    sceneVariants: [
      {
        name: '大巴车上',
        desc: '大巴开了两个小时，还没到地方。前排的人在组织唱歌，后排的人在假装睡觉。',
        mission: '在到达之前，把这场团建的发起人从车上请下去。',
        line: '大家一起唱一首，气氛搞起来！',
      },
    ],
    rows: 8,
    cols: 7,
    types: ['pua', 'shirk', 'overtime', 'grafter', 'formalist', 'flatterer'],
    moves: 17,
    taskTimerSeconds: 38,
    targetSequence: [
      { type: 'overtime', need: 2 },
      { type: 'formalist', need: 2 },
      { type: 'pua', need: 2 },
      { type: 'shirk', need: 2 },
      { type: 'grafter', need: 2 },
      { type: 'flatterer', need: 2 },
    ],
    minScore: 7200,
    starScores: [7200, 10000, 14000],
    rules: { poisonEveryMoves: 5, overtimeRate: 1.2 },
  },
  {
    id: 7,
    name: '绩效面谈',
    subtitle: '你的产出，和去年比有什么突破',
    scene: {
      name: '小会议室',
      desc: '小会议室，桌上摊着一张打印出来的表格。对面的人说：「我们先聊聊你今年的产出。」',
      mission: '在他念出评级之前，先把他扇出这间屋子。',
      line: '我们客观地聊一聊你今年的表现。',
    },
    sceneVariants: [
      {
        name: '走廊尽头',
        desc: '面谈改在走廊尽头的空工位，因为会议室全满了。旁边有人在打电话，你们说话都得压低声音。',
        mission: '在他给出评级之前，先把标准问清楚。',
        line: '这个评级是综合考量，不是针对你。',
      },
    ],
    rows: 8,
    cols: 8,
    types: ['pua', 'shirk', 'overtime', 'grafter', 'formalist', 'flatterer'],
    moves: 17,
    taskTimerSeconds: 36,
    targetSequence: [
      { type: 'pua', need: 2 },
      { type: 'shirk', need: 2 },
      { type: 'grafter', need: 2 },
      { type: 'overtime', need: 2 },
      { type: 'formalist', need: 2 },
      { type: 'flatterer', need: 2 },
    ],
    minScore: 8600,
    starScores: [8600, 11500, 14000],
    rules: { poisonEveryMoves: 5 },
  },
  {
    id: 8,
    name: '年终奖发放',
    subtitle: '说好的十三薪，变成了明年再说',
    scene: {
      name: 'HR 办公室',
      desc: '说好的十三薪，变成了「明年再说」。HR 笑着递给你一张印着公司 logo 的贺卡。',
      mission: '把画饼的人全部清掉，今年的钱一分都不能少。',
      line: '今年情况特殊，大家多理解一下。',
    },
    sceneVariants: [
      {
        name: '食堂',
        desc: '年终奖的消息是在食堂传开的。有人说发了，有人说没发，最后确认：发了，但不是所有人。',
        mission: '把发放明细要出来，顺便把挡着的人清走。',
        line: '具体金额是保密的，大家不要互相打听。',
      },
    ],
    rows: 8,
    cols: 8,
    types: ['pua', 'shirk', 'overtime', 'grafter', 'formalist', 'flatterer'],
    moves: 18,
    taskTimerSeconds: 34,
    targetSequence: [
      { type: 'pua', need: 3 },
      { type: 'shirk', need: 3 },
      { type: 'overtime', need: 3 },
      { type: 'grafter', need: 3 },
    ],
    minScore: 7000,
    starScores: [7000, 8500, 9800],
    rules: { poisonEveryMoves: 6, overtimeRate: 1.1 },
  },
  {
    id: 9,
    name: '裁员名单',
    subtitle: '会议室里那份表格，还没念到你的名字',
    scene: {
      name: '会议室门外',
      desc: '会议室的门关着，里面在念一份名单。已经有五个人进去了，没有一个出来。',
      mission: '在念到你的名字之前，把里面的人全部扇飞。',
      line: '这个事也不是我一个人能决定的。',
    },
    sceneVariants: [
      {
        name: '电梯口',
        desc: '电梯口贴了一张新的组织架构图。原来的部门名字被划掉，换成了一个更长的名字。',
        mission: '在名单公布之前，把里面的人全部扇飞。',
        line: '这次调整是为了让组织更健康。',
      },
    ],
    rows: 8,
    cols: 8,
    types: ['pua', 'shirk', 'overtime', 'grafter', 'formalist', 'flatterer'],
    moves: 21,
    taskTimerSeconds: 32,
    targetSequence: [
      { type: 'formalist', need: 3 },
      { type: 'flatterer', need: 3 },
      { type: 'pua', need: 3 },
      { type: 'shirk', need: 3 },
      { type: 'overtime', need: 3 },
    ],
    minScore: 7800,
    starScores: [7800, 10500, 12500],
    rules: { poisonEveryMoves: 4 },
  },
  {
    id: 10,
    name: '离职那天',
    subtitle: '今天，你决定不再忍了',
    scene: {
      name: '公司门口',
      desc: '离职手续办完，你抱着一个纸箱站在公司门口。回头看，这栋楼还在亮着灯。',
      mission: '最后一次，把这里面所有的坏领导都扇一遍。',
      line: '走了也好，外面的世界很精彩。',
    },
    sceneVariants: [
      {
        name: '楼下便利店',
        desc: '办完手续，你在楼下便利店买了瓶水。店员问你今天怎么这么早，你说，我离职了。',
        mission: '最后一次，把这些人全部打一遍再走。',
        line: '以后有空常回来看看啊。',
      },
    ],
    rows: 8,
    cols: 8,
    types: ['pua', 'shirk', 'overtime', 'grafter', 'formalist', 'flatterer'],
    moves: 22,
    taskTimerSeconds: 30,
    targetSequence: [
      { type: 'pua', need: 4 },
      { type: 'overtime', need: 4 },
      { type: 'formalist', need: 4 },
      { type: 'flatterer', need: 4 },
    ],
    minScore: 8800,
    starScores: [8800, 10000, 11500],
    rules: { poisonEveryMoves: 5, overtimeRate: 1.3 },
  },
];

/**
 * 随机挑一个场景：默认场景 + 所有变体里选一个。
 *
 * 用 seed 而不是 Math.random()，这样「重开同一关」时能复现，
 * 但「重新进入」时会换一个 —— 既满足随机，又不会闪来闪去。
 */
export function pickScene(level: LevelConfig, seed: number): LevelScene {
  const all = [level.scene, ...(level.sceneVariants ?? [])];
  if (all.length === 1) return level.scene;
  const idx = Math.abs(Math.floor(seed)) % all.length;
  return all[idx] ?? level.scene;
}

export function getLevel(id: number): LevelConfig {
  const found = LEVELS.find((l) => l.id === id);
  if (!found) throw new Error(`关卡 ${id} 不存在`);
  return found;
}

export const TOTAL_LEVELS = LEVELS.length;

/** 从预设里挑一个「适合当本关敌人」的类型组合 */
export function typesForLevel(level: LevelConfig): VillainType[] {
  return level.types.length > 0 ? level.types : BASE_TYPES;
}
