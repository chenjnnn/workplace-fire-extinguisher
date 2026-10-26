'use client';

/**
 * 工位槽 —— 工位槽模式的核心压力
 *
 * 用户的要求：「你消掉的非目标领导先进工位槽（最多 5 个），槽满 = 领导集体反扑，
 * 失败。囚车目标领导直接关押，不进工位槽。工位槽里的领导可以用道具开除清掉。」
 *
 * 为什么要有这个槽：
 *   三消里「消掉」永远是好事，玩家不需要考虑代价。
 *   但真实职场里，你扇飞的往往不是那个该扇的人 —— 剩下的人会堆到你工位上。
 *
 * 视觉上做成「你工位上堆着的文件/待办」，满了就红。
 */

import type { VillainType } from '@vc/core';
import { VillainTile } from '@/components/art';

interface Props {
  slots: VillainType[];
  max: number;
  /** 用「开除」清掉某一个（点格子触发） */
  onFire: (index: number) => void;
}

export function WorkSlots({ slots, max, onFire }: Props) {
  if (max <= 0) return null;

  const full = slots.length >= max;
  const nearFull = slots.length >= max - 1;

  return (
    <section className="mt-1.5 shrink-0">
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#5a5148]">
          <span className="text-[11px] leading-none">🗂️</span>
          工位槽
        </span>
        <span className="font-num text-[10px] leading-none">
          <span style={{ color: full ? '#ef4444' : nearFull ? '#f59e0b' : '#8a8177' }}>
            {slots.length}
          </span>
          <span className="text-[#b8a892]"> / {max}</span>
        </span>
        <span className="ml-auto text-[9px] leading-none text-[#b8a892]">
          {full ? '堆满了！' : '满了领导反扑'}
        </span>
      </div>

      <div
        className="mt-1 flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors"
        style={{ backgroundColor: full ? '#fdeaea' : '#fff8ec' }}
      >
        {Array.from({ length: max }).map((_, i) => {
          const type = slots[i];
          return (
            <div
              key={i}
              className="relative flex h-8 flex-1 items-center justify-center rounded-md"
              style={{
                backgroundColor: type ? '#ffffff' : '#f3ece0',
                boxShadow: type ? '0 1px 2px rgba(90,70,50,0.12)' : 'none',
              }}
            >
              {type ? (
                <button
                  type="button"
                  onClick={() => onFire(i)}
                  className="flex h-full w-full items-center justify-center active:scale-90"
                  aria-label="开除这个领导"
                  title="点一下开除（不计步数）"
                >
                  <VillainTile type={type} size={24} />
                </button>
              ) : (
                <span className="text-[8px] text-[#d8cbb8]">·</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
