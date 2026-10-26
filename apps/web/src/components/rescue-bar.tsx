'use client';

/**
 * 救援场景 —— 棋盘上方的「案件卡」
 *
 * 设计原则：
 *   1. 信息密度要高：名字 + 处境 + 进度 + 危险值，一眼看完
 *   2. 危险值必须**视觉上会说话**：绿→黄→红，且越危险脉动越快
 *   3. 救援成功/失败要有明确的状态变化，不能只是数字变了
 */

import { VILLAINS, type AvatarConfig, type VillainType } from '@vc/core';
import { AvatarFigure } from '@/components/art';

export interface RescueView {
  id: string;
  name: string;
  situation: string;
  type: VillainType;
  typeName: string;
  progress: number;
  needed: number;
  danger: number;
  status: 'active' | 'rescued' | 'lost';
  avatar: AvatarConfig;
  /** 危险值涨满所需总秒数 */
  dangerSeconds: number;
}

export function RescueBar({ rescues }: { rescues: RescueView[] }) {
  if (rescues.length === 0) return null;

  return (
    <section className="mt-2 flex shrink-0 gap-2">
      {rescues.map((rescue) => (
        <RescueCard key={rescue.id} rescue={rescue} compact={rescues.length > 1} />
      ))}
    </section>
  );
}

function RescueCard({ rescue, compact }: { rescue: RescueView; compact: boolean }) {
  const def = VILLAINS[rescue.type];
  const active = rescue.status === 'active';
  const rescued = rescue.status === 'rescued';
  const lost = rescue.status === 'lost';

  // 危险度分档：决定颜色和脉动速度
  const danger = rescue.danger;
  const level = danger < 0.4 ? 'safe' : danger < 0.75 ? 'warn' : 'critical';
  const dangerColor =
    level === 'safe' ? '#10b981' : level === 'warn' ? '#f59e0b' : '#f43f5e';
  const pulseSpeed = level === 'critical' ? '0.7s' : level === 'warn' ? '1.2s' : '2s';

  const progressRatio = rescue.needed === 0 ? 1 : rescue.progress / rescue.needed;
  // 剩余秒数比百分比直观得多：「还剩 12 秒」人人看得懂，「87%」没人知道是什么
  const secondsLeft = Math.max(0, Math.ceil((1 - danger) * rescue.dangerSeconds));

  return (
    <div
      className={`relative flex flex-1 items-center gap-2 overflow-hidden rounded-xl border px-2.5 py-2 shadow-sm transition-colors ${
        rescued
          ? 'border-[#10b981] bg-[#ecfdf5]'
          : lost
            ? 'border-[#e5d9c8] bg-white opacity-60'
            : 'border-[#f0e4d4] bg-white'
      }`}
    >
      {/* 危险值底纹：从右侧压过来，像倒计时在逼近 */}
      {active && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 opacity-20 transition-[width] duration-150 ease-linear"
          style={{
            width: `${danger * 100}%`,
            background: `linear-gradient(90deg, transparent, ${dangerColor})`,
          }}
        />
      )}

      {/* 受害者立绘 */}
      <div className="relative shrink-0">
        <AvatarFigure
          avatar={rescue.avatar}
          size={compact ? 44 : 58}
          className={lost ? 'grayscale' : ''}
        />
        {/* 状态角标 */}
        {rescued && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#4ade80] text-[9px] font-bold text-black">
            ✓
          </span>
        )}
        {lost && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#ff5c7a] text-[9px] font-bold text-black">
            ✕
          </span>
        )}
      </div>

      {/* 信息 */}
      <div className="relative min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-semibold text-[#3f3a35]">{rescue.name}</span>
          {active && (
            <span
              className="shrink-0 text-[10px] font-semibold tabular-nums"
              style={{ color: dangerColor }}
            >
              {secondsLeft}s
            </span>
          )}
          {rescued && <span className="shrink-0 text-[10px] text-[#4ade80]">已解救</span>}
          {lost && <span className="shrink-0 text-[10px] text-[#ff5c7a]">失败</span>}
        </div>

        {/* 处境：单行截断，避免卡片变高 */}
        <p className="line-clamp-2 text-[10px] leading-[1.35] text-[#a89e93]">{rescue.situation}</p>

        {/* 需求进度 */}
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className="shrink-0 rounded px-1 text-[9px] font-medium"
            style={{ color: def.color, backgroundColor: `${def.color}1f` }}
          >
            {rescue.typeName}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#f0e4d4]">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${Math.min(100, progressRatio * 100)}%`,
                backgroundColor: rescued ? '#4ade80' : def.color,
              }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-[#8b8177]">
            {rescue.progress}/{rescue.needed}
          </span>
        </div>

        {/* 危险条（倒计时） */}
        {active && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f0e4d4]">
            <div
              className="h-full rounded-full transition-[width] duration-150 ease-linear"
              style={{
                width: `${danger * 100}%`,
                backgroundColor: dangerColor,
                boxShadow: level === 'critical' ? `0 0 8px ${dangerColor}` : undefined,
                animation: level === 'critical' ? `pulseGlow ${pulseSpeed} ease-in-out infinite` : undefined,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
