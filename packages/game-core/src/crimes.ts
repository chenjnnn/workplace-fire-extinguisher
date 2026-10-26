/**
 * 罪状簿 —— 长线收集
 *
 * 用户采纳的建议：每次挑衅答对，给对应领导记一条「罪状」。
 * 集齐某个领导的 5 条，解锁「终极话术」：消他一个等于消三个。
 *
 * 为什么这个设计值得加：
 *   原本「答对问题」只换来一件用完就没的道具，是短线。
 *   罪状簿把同样一个动作接到长线上 —— 玩家会为了集齐而主动想答对。
 *
 * 为什么奖励是「效率」而不是「规则」：
 *   改规则（比如多给步数）会破坏关卡难度曲线；
 *   改效率（一个算三个）只是让玩家推进得更快，不会让关卡失去意义。
 */

import type { VillainType } from './types.ts';

/** 集齐多少条罪状解锁终极话术 */
export const CRIMES_TO_UNLOCK = 5;

export type CrimeBook = Partial<Record<VillainType, number>>;

/** 每答对一次，给这个领导记一条 */
export function addCrime(book: CrimeBook, type: VillainType): CrimeBook {
  const next = { ...book };
  next[type] = (next[type] ?? 0) + 1;
  return next;
}

/** 这个领导的罪状集齐了吗 */
export function isUnlocked(book: CrimeBook, type: VillainType): boolean {
  return (book[type] ?? 0) >= CRIMES_TO_UNLOCK;
}

/** 一共有几条罪状 */
export function totalCrimes(book: CrimeBook): number {
  return Object.values(book).reduce((sum, n) => sum + (n ?? 0), 0);
}

/** 消除了一个该类型的领导时，应该记几分（解锁后一个算三个） */
export function crimeMultiplier(book: CrimeBook, type: VillainType): number {
  return isUnlocked(book, type) ? 3 : 1;
}
