/**
 * 结算 / 分享数据
 *
 * 只产出「数据」，不产出图片：
 *   · 网页端用 canvas 把数据画成海报
 *   · 小程序端用同结构数据画（或用 canvas 2d 同款代码）
 * 这样分享逻辑也是平台无关的。
 */

import type { AvatarConfig, GameState, VillainType } from './types.ts';
import { VILLAINS } from './types.ts';
import { avatarPersona } from './avatar.ts';
import { computeStars } from './game.ts';

export interface ShareData {
  /** 大标题 */
  title: string;
  /** 副标题 */
  subtitle: string;
  /** 星级 0-3 */
  stars: number;
  score: number;
  /** 清理总数 */
  totalCleared: number;
  /** 最高连锁 */
  maxChain: number;
  /** 分类明细，按数量降序 */
  breakdown: Array<{ type: VillainType; name: string; count: number; color: string }>;
  /** 用户捏的形象的人设文案 */
  persona: { title: string; line: string } | null;
  /** 关卡名 */
  levelName: string;
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 免责声明 —— 必须有，别删 */
  disclaimer: string;
}

export const DISCLAIMER = '游戏内所有角色均为虚构卡通形象，与任何真实人物、组织无关，如有雷同纯属巧合。';

export function buildShareData(
  state: GameState,
  avatar: AvatarConfig | null,
  now = new Date(),
): ShareData {
  const stars = computeStars(state);
  const breakdown = (Object.entries(state.clearedCount) as Array<[VillainType, number]>)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({
      type,
      name: VILLAINS[type].name,
      count,
      color: VILLAINS[type].color,
    }))
    .sort((a, b) => b.count - a.count);

  const persona = avatar ? avatarPersona(avatar) : null;

  const title =
    state.phase === 'won'
      ? `我清理了 ${state.totalCleared} 个坏人`
      : `差一点就抓到 ${state.totalCleared} 个坏人`;

  const subtitle =
    state.phase === 'won'
      ? `${state.level.name} · ${stars} 星通关${state.sweepUsed > 0 ? ` · 放倒 ${state.sweepUsed} 次收网行动` : ''}`
      : `${state.level.name} · 还差 ${state.movesLeft === 0 ? '最后一步' : '一点点'}`;

  return {
    title,
    subtitle,
    stars,
    score: state.score,
    totalCleared: state.totalCleared,
    maxChain: state.maxChain,
    breakdown,
    persona,
    levelName: state.level.name,
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    disclaimer: DISCLAIMER,
  };
}

/** 连击文案的颜色倾向，渲染层用 */
export function comboColor(chain: number): string {
  if (chain >= 5) return '#ff4d6d';
  if (chain >= 3) return '#ffc93c';
  if (chain >= 2) return '#38e1ff';
  return '#e8e8ef';
}
