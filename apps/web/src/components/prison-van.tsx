'use client';

/**
 * 囚车 —— 替代抽象的进度条
 *
 * 用户的原话：「上面的收网和进度条的关系很不明确，可以把进度条换成一个囚车或者监狱，
 * 然后每消掉一次，就放上去一个对应的头像，然后满多少个说明过关。」
 *
 * 设计要点：
 *   1. 车厢用深灰蓝，铁栏用浅色竖线 —— 对比强，一眼就是「笼子」
 *   2. 固定 8 个牢房位，每格代表 total/8 的进度（目标动辄 30-80，不可能真放 80 个）
 *   3. 关进去的放对应类型的头像，空的画成空牢房
 *   4. 收网做成车厢右侧的「警笛」按钮，怒值满了才亮
 */

import type { VillainType } from '@vc/core';
import { VillainTile } from '@/components/art';

interface Props {
  current: number;
  total: number;
  recentTypes: VillainType[];
  fallbackType: VillainType;
  /** 收网：能不能用 */
  canSweep: boolean;
  /** 本关还能用几次收网 */
  sweepLeft: number;
  onSweep: () => void;
}

/** 囚车上的固定牢房数 */
const SLOTS = 12;

export function PrisonVan({
  current,
  total,
  recentTypes,
  fallbackType,
  canSweep,
  sweepLeft,
  onSweep,
}: Props) {
  const perSlot = total / SLOTS;
  const filledSlots = total === 0 ? SLOTS : Math.min(SLOTS, Math.round(current / perSlot));
  const done = current >= total;
  const sweepUsable = canSweep && sweepLeft > 0;

  return (
    <section className="mt-2 shrink-0">
      <div className="flex items-stretch gap-2">
        {/* ---- 囚车 ---- */}
        <div className="flex-1">
          {/* 车顶标题 */}
          <div className="mb-1 flex items-baseline justify-between px-0.5">
            <span className="flex items-center gap-1 text-[11px] font-bold text-[#5a5148]">
              <span className="text-[13px] leading-none">🚔</span>
              囚车
            </span>
            <span className="font-num text-[11px] leading-none">
              <span style={{ color: done ? '#2e8b57' : '#ff6b4a' }}>{Math.min(current, total)}</span>
              <span className="text-[#b8a892]"> / {total}</span>
            </span>
          </div>

          {/* 车厢（深色） */}
          <div className="relative rounded-t-[10px] rounded-b-[4px] bg-[#3d4655] px-1.5 pb-2 pt-1.5">
            {/* 顶部警灯条 */}
            <div className="mb-1 flex justify-center gap-1">
              <span
                className="h-1 w-4 rounded-full"
                style={{ backgroundColor: done ? '#4ade80' : '#ff5f5f' }}
              />
              <span
                className="h-1 w-4 rounded-full"
                style={{ backgroundColor: done ? '#4ade80' : '#4aa3ff' }}
              />
            </div>

            {/* 牢房 */}
            <div className="relative flex items-center gap-[2px]">
              {Array.from({ length: SLOTS }).map((_, i) => {
                const filled = i < filledSlots;
                const type = recentTypes[i] ?? fallbackType;
                return (
                  <div
                    key={i}
                    className="relative flex aspect-square flex-1 items-center justify-center overflow-hidden rounded-[3px]"
                    style={{ backgroundColor: filled ? '#fff3e8' : '#2b323d' }}
                  >
                    {filled ? (
                      <VillainTile type={type} size={20} />
                    ) : (
                      // 空牢房：画三根竖栏，一眼是笼子
                      <span className="flex h-full w-full items-center justify-center gap-[2px]">
                        {[0, 1, 2].map((k) => (
                          <span key={k} className="h-3/4 w-[1.5px] rounded-full bg-white/14" />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 铁栏杆：盖在牢房之间的分隔上 */}
            <div className="pointer-events-none absolute inset-x-1.5 bottom-2 top-[30px] flex justify-between">
              {Array.from({ length: SLOTS + 1 }).map((_, i) => (
                <span key={i} className="w-[2px] rounded-full bg-white/35" />
              ))}
            </div>
          </div>

          {/* 车底 + 轮子 */}
          <div className="relative h-3">
            <div className="absolute inset-x-1 top-0 h-[5px] rounded-b-[3px] bg-[#2b323d]" />
            <div className="absolute left-[9%] top-0 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-[#3d4655] bg-[#1d222a]" />
            <div className="absolute right-[9%] top-0 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-[#3d4655] bg-[#1d222a]" />
          </div>
        </div>

        {/* ---- 收网（警笛） ---- */}
        <button
          type="button"
          onClick={onSweep}
          disabled={!sweepUsable}
          className={`relative flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl transition active:scale-95 disabled:active:scale-100 ${
            sweepUsable ? 'w-[62px]' : 'w-[58px]'
          }`}
          style={{
            backgroundColor: sweepUsable ? '#ff6b4a' : '#f0e8dc',
            color: sweepUsable ? '#ffffff' : '#b8a892',
          }}
          aria-label="收网行动"
        >
          <span className="text-[22px] leading-none">🚨</span>
          <span className="text-[10px] font-bold leading-none">
            {sweepUsable ? '收网' : '未满'}
          </span>
          {sweepLeft > 0 && (
            <span
              className="absolute right-1 top-1 rounded-full px-1 text-[8px] leading-none"
              style={{
                backgroundColor: sweepUsable ? 'rgba(255,255,255,0.3)' : '#e0d3c0',
                color: sweepUsable ? '#fff' : '#a89e93',
              }}
            >
              {sweepLeft}
            </span>
          )}
        </button>
      </div>
    </section>
  );
}
