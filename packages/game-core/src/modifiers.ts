/**
 * 词缀系统
 *
 * 每日挑战和无尽模式用「词缀」改关卡：每个词缀是一组配置偏移，
 * 不碰核心逻辑，只改数值 —— 这样规则永远自洽，也不会互相打架。
 *
 * 设计原则：
 *   1. 每个词缀必须**一句话说清**
 *   2. 效果必须能在 UI 上看见（棋盘尺寸/步数/时间都是可见的）
 *   3. 不引入「看不见的状态」（这是这版反复踩坑的地方）
 */

import type { LevelConfig, VillainType } from './types.ts';

export interface Modifier {
  id: string;
  name: string;
  /** 一句话说明，直接显示在挑战开始前 */
  desc: string;
  /** 对关卡配置的改动 */
  apply: (level: LevelConfig) => LevelConfig;
}

/** 给链追加若干格（相邻不同色） */
function extendChain(chain: VillainType[], add: number, seed: number): VillainType[] {
  const all: VillainType[] = ['pua', 'shirk', 'grafter', 'overtime', 'formalist', 'flatterer'];
  const out = [...chain];
  for (let i = 0; i < add; i += 1) {
    const prev = out[out.length - 1];
    for (let k = 0; k < all.length; k += 1) {
      const t = all[(seed + i + k) % all.length]!;
      if (t !== prev) {
        out.push(t);
        break;
      }
    }
  }
  return out;
}

export const MODIFIERS: Modifier[] = [
  {
    id: 'pie-meeting',
    name: '画饼大会',
    desc: '任务链多 2 格（额外的颜色）',
    apply: (lv) => ({
      ...lv,
      targetChain: extendChain(lv.targetChain, 2, lv.id),
      moves: lv.moves + 2,
    }),
  },
  {
    id: 'shirk-chain',
    name: '甩锅连锁',
    desc: '棋盘上干扰色权重 +0.2（目标色更难凑）',
    apply: (lv) => {
      const target = lv.targetChain[0];
      const types = lv.types ?? [];
      const w: Partial<Record<VillainType, number>> = {};
      for (const t of types) w[t] = t === target ? 1 : 1.2;
      return { ...lv, typeWeights: w };
    },
  },
  {
    id: 'grafter-double',
    name: '抢功加倍',
    desc: '抢功精变成 3 条命',
    apply: (lv) => ({ ...lv, hpBoost: { grafter: 1 } }),
  },
  {
    id: 'overtime-bite',
    name: '加班反噬',
    desc: '加班魔反咬翻倍（每只扣 14 分）',
    apply: (lv) => ({ ...lv, overtimeBiteScale: 2 }),
  },
  {
    id: 'formalist-blast',
    name: '形式主义',
    desc: '形式怪的十字爆裂半径 +1 格',
    apply: (lv) => ({ ...lv, formalistBlastBonus: 1 }),
  },
  {
    id: 'all-hands',
    name: '全员大会',
    desc: '棋盘从 8×8 变成 9×9',
    apply: (lv) => ({ ...lv, rows: 9, cols: 9 }),
  },
  {
    id: 'parachute',
    name: '空降领导',
    desc: '开局随机 8 格变成同一种颜色',
    apply: (lv) => ({ ...lv, openingCluster: 8 }),
  },
  {
    id: 'kpi-timer',
    name: '绩效倒计时',
    desc: '每格时限 −20%',
    apply: (lv) => ({
      ...lv,
      taskTimerSeconds: lv.taskTimerSeconds
        ? Math.max(12, Math.round(lv.taskTimerSeconds * 0.8))
        : 24,
    }),
  },
  {
    id: 'layoff-panic',
    name: '裁员恐慌',
    desc: '步数 −2（最低 5 步）',
    apply: (lv) => ({ ...lv, moves: Math.max(5, lv.moves - 2) }),
  },
  {
    id: 'forced-teambuild',
    name: '团建强制',
    desc: '每 8 步强制洗一次牌',
    apply: (lv) => ({ ...lv, forcedReshuffleEvery: 8 }),
  },
  {
    id: 'scapegoat',
    name: '背锅侠',
    desc: '每 3 格任务完成后额外扣 1 步',
    apply: (lv) => ({ ...lv, taskStepPenalty: 1 }),
  },
  {
    id: 'yin-yang',
    name: '阴阳合同',
    desc: '跳过门槛 +30%，但跳过次数 +1',
    apply: (lv) => ({
      ...lv,
      sweepThresholds: lv.sweepThresholds
        ? [
            Math.round(lv.sweepThresholds[0] * 1.3),
            Math.round(lv.sweepThresholds[1] * 1.3),
          ]
        : undefined,
      skipsAllowed: (lv.skipsAllowed ?? 2) + 1,
    }),
  },
];

export function getModifier(id: string): Modifier | undefined {
  return MODIFIERS.find((m) => m.id === id);
}

/** 把一组词缀依次套用到关卡上 */
export function applyModifiers(level: LevelConfig, ids: string[]): LevelConfig {
  return ids.reduce((acc, id) => {
    const m = getModifier(id);
    return m ? m.apply(acc) : acc;
  }, level);
}

/** 用种子从池子里抽 n 个不重复的词缀 */
export function pickModifiers(seed: number, n: number): string[] {
  const pool = [...MODIFIERS];
  let s = seed >>> 0 || 1;
  for (let i = pool.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(n, pool.length)).map((m) => m.id);
}
