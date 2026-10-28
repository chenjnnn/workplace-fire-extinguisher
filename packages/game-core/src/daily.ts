/**
 * 每日挑战
 *
 * 用日期当种子生成一局固定关卡：全网同一天看到的棋盘、任务链、词缀都一样。
 * 不需要后端，成绩存 localStorage。
 */

import type { LevelConfig, VillainType } from './types.ts';
import { applyModifiers, pickModifiers } from './modifiers.ts';

const ALL_TYPES: VillainType[] = ['pua', 'shirk', 'grafter', 'overtime', 'formalist', 'flatterer'];

/** 本地时区的 YYYYMMDD 数字 */
export function dailySeed(date = new Date()): number {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return Number(`${y}${m}${d}`);
}

/** 今天的日期字符串，用来判断「今天是否已经玩过」 */
export function todayKey(date = new Date()): string {
  return String(dailySeed(date));
}

/** 用日期种子搭一条相邻不同色的链 */
function buildChain(seed: number, len: number): VillainType[] {
  const out: VillainType[] = [];
  let s = seed >>> 0;
  for (let i = 0; i < len; i += 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const prev = out[out.length - 1];
    for (let k = 0; k < ALL_TYPES.length; k += 1) {
      const t = ALL_TYPES[(s + k) % ALL_TYPES.length]!;
      if (t !== prev) {
        out.push(t);
        break;
      }
    }
  }
  return out;
}

/** 每 7 天是 Boss 日：2 个词缀 */
export function isBossDay(seed: number): boolean {
  return seed % 7 === 0;
}

/**
 * 生成今天的每日挑战关卡。
 *
 * 难度不随主线进度变化 —— 每天固定，所有人一样。
 */
export function createDailyLevel(date = new Date()): LevelConfig {
  const seed = dailySeed(date);
  const chainLen = 6 + (seed % 4); // 6-9
  const moves = Math.round(chainLen * 1.3);
  const timer = 30 - (seed % 6); // 25-30s

  const base: LevelConfig = {
    id: 1000,
    name: '每日挑战',
    subtitle: `每日随机局 · ${seed}`,
    chapter: 1,
    scene: {
      name: '每日挑战',
      desc: '每天一局，全网同题。今天的领导情绪特别稳定，因为今天是随机生成的。',
      mission: '用一个字总结今天：打。',
      line: '今天的题目不是我出的，是系统出的。',
    },
    rows: 8,
    cols: 8,
    types: ALL_TYPES,
    moves,
    skipsAllowed: 2,
    sweepThresholds: [2400 + (seed % 5) * 100, 4800 + (seed % 5) * 200],
    targetChain: buildChain(seed, chainLen),
    minScore: 4000,
    starScores: [4000, 7000, 10000],
    taskTimerSeconds: timer,
  };

  const mods = pickModifiers(seed, isBossDay(seed) ? 2 : 1);
  return applyModifiers(base, mods);
}

/** 这一局用了哪些词缀（给 UI 显示） */
export function dailyModifierIds(date = new Date()): string[] {
  const seed = dailySeed(date);
  return pickModifiers(seed, isBossDay(seed) ? 2 : 1);
}
