/**
 * 可复现的随机数 —— 必须带种子。
 *
 * 为什么不能直接用 Math.random：
 *   1. 每日挑战需要全服同一副棋盘
 *   2. 出了 bug 可以凭种子 100% 复现
 *   3. 单元测试需要确定性
 */

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [0, max) 整数 */
  int(max: number): number;
  /** 从数组里随机取一个 */
  pick<T>(items: readonly T[]): T;
  /** 洗牌（原地） */
  shuffle<T>(items: T[]): T[];
  /** 当前内部状态，用于存档 */
  state(): number;
}

/** mulberry32：32 位状态，快，分布够好，适合游戏 */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(max: number): number {
      if (max <= 0) return 0;
      return Math.floor(next() * max);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick: 数组为空');
      // 严格模式下索引可能越界，这里保证落在范围内
      const idx = Math.min(items.length - 1, Math.floor(next() * items.length));
      return items[idx] as T;
    },
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = items[i] as T;
        items[i] = items[j] as T;
        items[j] = tmp;
      }
      return items;
    },
    state(): number {
      return s >>> 0;
    },
  };
}

/** 把日期变成种子：每日挑战用 YYYYMMDD */
export function seedFromDate(date: Date): number {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return y * 10000 + m * 100 + d;
}

/** 给摇杆加一点扰动，避免每次都一样（但用户点「重来」时用固定种子） */
export function seedFromTimestamp(now: number): number {
  return (now ^ (now >>> 16)) >>> 0;
}
