/**
 * 加班无尽模式（「加班到死」）
 *
 * 无限关卡、难度递增、死亡重来。
 * 每关随机 1-3 个词缀，每 5 关一个 Boss 波。
 */

import type { LevelConfig, VillainType } from './types.ts';
import { applyModifiers, pickModifiers } from './modifiers.ts';

const ALL_TYPES: VillainType[] = ['pua', 'shirk', 'grafter', 'overtime', 'formalist', 'flatterer'];

/** 第 stage 关的链长 */
export function endlessChainLength(stage: number): number {
  return Math.min(15, 3 + Math.floor(stage / 2));
}

/** 第 stage 关的步数 */
export function endlessMoves(stage: number): number {
  return Math.max(6, Math.floor(endlessChainLength(stage) * 1.2));
}

/** 第 stage 关每格时限（秒）；前 2 关不给倒计时 */
export function endlessTimer(stage: number): number | undefined {
  if (stage <= 2) return undefined;
  return Math.max(15, 40 - stage);
}

/** 是否是 Boss 波（每 5 关） */
export function isBossStage(stage: number): boolean {
  return stage % 5 === 0;
}

/** 第 stage 关用几个词缀 */
export function endlessModifierCount(stage: number): number {
  if (stage <= 2) return 0;
  if (isBossStage(stage)) return 3;
  return Math.min(2, 1 + Math.floor(stage / 6));
}

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

/**
 * 生成无尽模式第 stage 关。
 *
 * 难度递增：
 *   · 链长 3 → 15
 *   · 步数 = 链长 × 1.2（最少 6）
 *   · 时间 40 − stage（最少 15s），前 2 关不给
 *   · 词缀 0 → 3 个（Boss 波必 3 个）
 *   · 干扰色权重每 5 关 +0.05（封顶 1.5）
 */
export function createEndlessLevel(stage: number, seed = Date.now()): LevelConfig {
  const chainLen = endlessChainLength(stage);
  const chain = buildChain(seed ^ (stage * 7919), chainLen);
  const target = chain[0]!;
  const extra = Math.min(0.5, 0.05 * Math.floor(stage / 5));
  const weights: Partial<Record<VillainType, number>> = {};
  for (const t of ALL_TYPES) weights[t] = t === target ? 1 : Number((1 + extra).toFixed(2));

  const base: LevelConfig = {
    id: 2000 + stage,
    name: `加班第 ${stage} 关`,
    subtitle: isBossStage(stage) ? 'Boss 波' : `还活着，第 ${stage} 关`,
    chapter: 1,
    scene: {
      name: isBossStage(stage) ? '会议室（灯全亮着）' : `工位（第 ${stage} 晚）`,
      desc: isBossStage(stage)
        ? '所有灯都亮着，所有人都还在。没人说话，只有键盘声。'
        : '你已经记不清今天是第几天了。窗外的天色和昨天一样。',
      mission: isBossStage(stage) ? '这一波扛过去，就能再扛一波。' : '继续。',
      line: '再坚持一下，马上就好了。',
    },
    rows: 8,
    cols: 8,
    types: ALL_TYPES,
    moves: endlessMoves(stage),
    skipsAllowed: 2,
    sweepThresholds: [2000 + stage * 200, 4000 + stage * 400],
    targetChain: chain,
    minScore: 3000 + stage * 500,
    starScores: [3000 + stage * 500, 6000 + stage * 800, 9000 + stage * 1100],
    taskTimerSeconds: endlessTimer(stage),
    typeWeights: weights,
  };

  const count = endlessModifierCount(stage);
  const mods = count > 0 ? pickModifiers(seed ^ (stage * 104729), count) : [];
  return applyModifiers(base, mods);
}

/** 第 stage 关用了哪些词缀 */
export function endlessModifierIds(stage: number, seed = Date.now()): string[] {
  const count = endlessModifierCount(stage);
  return count > 0 ? pickModifiers(seed ^ (stage * 104729), count) : [];
}
