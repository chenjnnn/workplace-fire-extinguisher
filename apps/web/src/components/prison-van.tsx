'use client';

/**
 * 囚车 —— 多隔间目标
 *
 * 用户的要求：「把现在单一的 0/62 总数，改成需要凑够指定几种领导才能通关的多目标。
 * 每关囚车配置 1~4 个目标隔间，每个隔间指定一种领导类型和需要数量。
 * 只有消除对应类型的领导才计入该隔间进度，其他类型照常消除得分但不进囚车。
 * 所有隔间都装满才通关。」
 *
 * 为什么这比单一进度条好：
 *   单一计数下「消哪种颜色都一样」，玩家不需要看目标。
 *   多个隔间就有取舍了 —— 画饼王那格差 1 个，你会优先找它。
 *
 * 视觉：每个隔间像一间牢房，装了犯人就显示头像 + 进度，
 * 装满后变绿打勾，一眼能看出还剩哪几间没满。
 */

import type { VillainType } from '@vc/core';
import { VILLAINS } from '@vc/core';
import { VillainTile } from '@/components/art';

export interface VanGoal {
  type: VillainType | 'any';
  name: string;
  color: string;
  current: number;
  count: number;
  /** 连击模式：要几连才算 */
  size?: number;
}

interface Props {
  goals: VanGoal[];
  /** 收网：能不能用 */
  canSweep: boolean;
  /** 本关还能用几次收网 */
  sweepLeft: number;
  onSweep: () => void;
}

export function PrisonVan({ goals, canSweep, sweepLeft, onSweep }: Props) {
  const doneCount = goals.filter((g) => g.current >= g.count).length;
  const allDone = goals.length > 0 && doneCount === goals.length;
  const sweepUsable = canSweep && sweepLeft > 0;

  return (
    <section className="mt-2 shrink-0">
      <div className="flex items-stretch gap-2">
        {/* ---- 囚车 ---- */}
        <div className="flex-1">
          {/* 车顶：标题 + 已满隔间数 */}
          <div className="mb-1 flex items-baseline justify-between px-0.5">
            <span className="flex items-center gap-1 text-[11px] font-bold text-[#5a5148]">
              <span className="text-[13px] leading-none">🚔</span>
              囚车
            </span>
            <span className="font-num text-[11px] leading-none">
              <span style={{ color: allDone ? '#2e8b57' : '#ff6b4a' }}>{doneCount}</span>
              <span className="text-[#b8a892]"> / {goals.length} 间</span>
            </span>
          </div>

          {/* 车厢 */}
          <div className="relative rounded-t-[10px] rounded-b-[4px] bg-[#3d4655] px-1.5 pb-2 pt-1.5">
            {/* 警灯 */}
            <div className="mb-1 flex justify-center gap-1">
              <span
                className="h-1 w-4 rounded-full"
                style={{ backgroundColor: allDone ? '#4ade80' : '#ff5f5f' }}
              />
              <span
                className="h-1 w-4 rounded-full"
                style={{ backgroundColor: allDone ? '#4ade80' : '#4aa3ff' }}
              />
            </div>

            {/* 隔间 */}
            <div className="flex items-stretch gap-1.5">
              {goals.map((g, i) => {
                const filled = g.current >= g.count;
                const ratio = g.count === 0 ? 1 : Math.min(1, g.current / g.count);
                const skin = g.type === 'any' ? '#f59e0b' : (VILLAINS[g.type]?.color ?? '#f59e0b');
                const tile = g.type === 'any' ? null : g.type;

                return (
                  <div
                    key={`${g.type}-${i}`}
                    className="flex flex-1 flex-col items-center rounded-[4px] px-1 py-1 transition-colors"
                    style={{ backgroundColor: filled ? '#1f3a2a' : '#2b323d' }}
                  >
                    {/* 装满打勾，否则显示头像 */}
                    <div className="relative">
                      {filled ? (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2e8b57]">
                          <span className="text-[13px] leading-none text-white">✓</span>
                        </div>
                      ) : tile ? (
                        <VillainTile type={tile} size={28} />
                      ) : (
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[12px]"
                          style={{ backgroundColor: `${skin}44`, color: skin }}
                        >
                          •
                        </div>
                      )}
                    </div>

                    {/* 连击标签：要几连 */}
                    {g.size && (
                      <span
                        className="mt-0.5 rounded px-1 text-[8px] font-bold leading-tight"
                        style={{
                          backgroundColor: filled ? '#2e8b57' : 'rgba(255,255,255,0.14)',
                          color: filled ? '#fff' : '#c9d0da',
                        }}
                      >
                        {g.size}连
                      </span>
                    )}

                    {/* 进度：完成次数 */}
                    <span
                      className="font-num mt-0.5 text-[10px] leading-none"
                      style={{ color: filled ? '#7dd3a0' : '#c9d0da' }}
                    >
                      {Math.min(g.current, g.count)}/{g.count}
                      {g.size ? '次' : ''}
                    </span>

                    {/* 细进度条 */}
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${ratio * 100}%`,
                          backgroundColor: filled ? '#4ade80' : skin,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
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
          <span className="text-[10px] font-bold leading-none">{sweepUsable ? '收网' : '未满'}</span>
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
