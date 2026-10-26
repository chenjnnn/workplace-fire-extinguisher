/**
 * 本地存档 —— 进度、形象、音效偏好
 *
 * 用 localStorage 而不是后端：首版不需要账号，也避免为了排行榜提前做用户体系。
 * 结构统一放一个 key 下，方便将来整体迁移到服务端。
 */

import type { AvatarConfig } from '@vc/core';
import { DEFAULT_AVATAR, sanitizeAvatar } from '@vc/core';

const KEY = 'villain-clear:v1';

export interface Progress {
  /** 每关的星数，key = 关卡 id */
  stars: Record<string, number>;
  /** 每关最高分 */
  bestScore: Record<string, number>;
  /** 已解锁到第几关 */
  unlocked: number;
  /** 总清理数 */
  totalCleared: number;
  /** 玩过的局数 */
  plays: number;
  /** 最大连锁 */
  bestChain: number;
}

export interface SaveData {
  progress: Progress;
  avatar: AvatarConfig;
  soundOn: boolean;
  /** 是否看过「虚构角色声明」 */
  disclaimerAck: boolean;
  /** 罪状簿：每种领导记了几条罪状（集齐 5 条解锁「一个算三个」） */
  crimes: Record<string, number>;
  /** 离职信碎片：哪些关已经拿到（key = 关卡 id） */
  fragments: Record<string, boolean>;
}

export function defaultSave(): SaveData {
  return {
    progress: {
      stars: {},
      bestScore: {},
      unlocked: 1,
      totalCleared: 0,
      plays: 0,
      bestChain: 0,
    },
    avatar: { ...DEFAULT_AVATAR },
    soundOn: true,
    disclaimerAck: false,
    crimes: {},
    fragments: {},
  };
}

export function loadSave(): SaveData {
  if (typeof window === 'undefined') return defaultSave();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const base = defaultSave();
    return {
      progress: {
        ...base.progress,
        ...(parsed.progress ?? {}),
        stars: { ...base.progress.stars, ...(parsed.progress?.stars ?? {}) },
        bestScore: { ...base.progress.bestScore, ...(parsed.progress?.bestScore ?? {}) },
      },
      avatar: sanitizeAvatar(parsed.avatar ?? base.avatar),
      soundOn: typeof parsed.soundOn === 'boolean' ? parsed.soundOn : true,
      disclaimerAck: Boolean(parsed.disclaimerAck),
      crimes: { ...base.crimes, ...(parsed.crimes ?? {}) },
      fragments: { ...base.fragments, ...(parsed.fragments ?? {}) },
    };
  } catch {
    return defaultSave();
  }
}

export function persistSave(data: SaveData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 隐私模式下 localStorage 可能不可用，忽略即可
  }
}

/** 通关后更新进度 */
export function applyLevelResult(
  save: SaveData,
  levelId: number,
  stars: number,
  score: number,
  totalCleared: number,
  maxChain: number,
): SaveData {
  const key = String(levelId);
  const prevStars = save.progress.stars[key] ?? 0;
  const prevBest = save.progress.bestScore[key] ?? 0;

  const nextStars = Math.max(prevStars, stars);
  const nextBest = Math.max(prevBest, score);
  // 通关（至少 1 星）才解锁下一关
  const unlocked = stars > 0 ? Math.max(save.progress.unlocked, levelId + 1) : save.progress.unlocked;

  return {
    ...save,
    progress: {
      ...save.progress,
      stars: { ...save.progress.stars, [key]: nextStars },
      bestScore: { ...save.progress.bestScore, [key]: nextBest },
      unlocked,
      totalCleared: save.progress.totalCleared + totalCleared,
      plays: save.progress.plays + 1,
      bestChain: Math.max(save.progress.bestChain, maxChain),
    },
  };
}

export function resetSave(): SaveData {
  const fresh = defaultSave();
  persistSave(fresh);
  return fresh;
}
