'use client';

/**
 * 囚车 —— 按颜色顺序抓人
 *
 * 用户的要求：「每关配置一个 targetSequence 数组，按顺序列出需要的颜色；
 * 只有当前目标颜色的消除才计入当前隔间；其他颜色照常消除得分，但不推进囚车。
 * 当前隔间完成后打勾变灰，自动推进到下一个颜色。」
 *
 * 为什么顺序比「凑够总数」好：
 *   凑总数时消哪种颜色都一样，玩家不需要看目标；
 *   指定顺序之后，「现在该抓粉色」变成一条明确指令，
 *   每一次交换都在为当前这一格服务。
 *
 * 三种状态：
 *   done    —— 已抓完，变灰打勾
 *   current —— 正在抓，亮色描边 + 呼吸点
 *   future  —— 还没轮到，压暗
 */

import type { VillainType } from '@vc/core';
import { VillainTile } from '@/components/art';

interface VanSlot {
  type: VillainType;
  name: string;
  color: string;
  state: 'done' | 'current' | 'future';
}

interface Props {
  sequence: VanSlot[];
  /** 还能跳过几次（每消 5 个非目标色换 1 次） */
  skipsLeft: number;
  onSkip: () => void;
  /** 收网：能不能用 */
  canSweep: boolean;
  /** 本关还能用几次收网 */
  sweepLeft: number;
  onSweep: () => void;
}

export function PrisonVan({ sequence, skipsLeft, onSkip, canSweep, sweepLeft, onSweep }: Props) {
  const doneCount = sequence.filter((s) => s.state === 'done').length;
  const allDone = sequence.length > 0 && doneCount === sequence.length;
  const sweepUsable = canSweep && sweepLeft > 0;

  // 隔间多的时候缩小头像，保证一行放得下
  const tileSize = sequence.length >= 7 ? 18 : sequence.length >= 5 ? 22 : 26;

  return (
    <section className="mt-2 shrink-0">
      <div className="flex items-stretch gap-2">
        {/* ---- 囚车 ---- */}
        <div className="flex-1">
          <div className="mb-1 flex items-baseline justify-between px-0.5">
            <span className="flex items-center gap-1 text-[11px] font-bold text-[#5a5148]">
              <span className="text-[13px] leading-none">🚔</span>
              囚车
            </span>
            <span className="font-num text-[11px] leading-none">
              <span style={{ color: allDone ? '#2e8b57' : '#ff6b4a' }}>{doneCount}</span>
              <span className="text-[#b8a892]"> / {sequence.length} 间</span>
            </span>
          </div>

          {skipsLeft > 0 && (
            <button
              type="button"
              onClick={onSkip}
              className="mb-1 flex w-full items-center justify-center gap-1 rounded-md bg-[#fff3e8] py-1 text-[10px] font-bold text-[#ff6b4a] active:scale-[0.98]"
            >
              ⏭ 跳过这一格（还剩 {skipsLeft} 次）
            </button>
          )}

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

            {/* 隔间：按顺序排 */}
            <div className="flex items-stretch gap-1">
              {sequence.map((slot, i) => {
                const done = slot.state === 'done';
                const isCurrent = slot.state === 'current';

                return (
                  <div
                    key={i}
                    className="relative flex flex-1 flex-col items-center rounded-[4px] px-0.5 py-1 transition-all"
                    style={{
                      backgroundColor: done ? '#1f3a2a' : isCurrent ? '#3a4454' : '#262c36',
                      ...(isCurrent
                        ? { boxShadow: `0 0 0 2px ${slot.color}`, transform: 'scale(1.05)' }
                        : {}),
                    }}
                  >
                    {/* 打勾 / 头像 */}
                    <div className="relative flex items-center justify-center">
                      {done ? (
                        <div
                          className="flex items-center justify-center rounded-full bg-[#2e8b57]"
                          style={{ width: tileSize, height: tileSize }}
                        >
                          <span className="text-[11px] leading-none text-white">✓</span>
                        </div>
                      ) : (
                        <div style={{ opacity: isCurrent ? 1 : 0.42 }}>
                          <VillainTile type={slot.type} size={tileSize} />
                        </div>
                      )}

                      {isCurrent && (
                        <span
                          className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full"
                          style={{ backgroundColor: slot.color }}
                        />
                      )}
                    </div>

                    {/* 状态：没有数量，只有「该抓 / 已抓 / 待抓」 */}
                    <span
                      className="mt-0.5 text-[8px] leading-none"
                      style={{ color: done ? '#7dd3a0' : isCurrent ? '#ffffff' : '#8b95a3' }}
                    >
                      {done ? '已抓' : isCurrent ? '现在' : '待抓'}
                    </span>
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
          aria-label="跳过当前目标"
        >
          <span className="text-[22px] leading-none">{sweepUsable ? '🚨' : '🔒'}</span>
          <span className="text-[10px] font-bold leading-none">{sweepUsable ? '跳过' : '攒分中'}</span>
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
