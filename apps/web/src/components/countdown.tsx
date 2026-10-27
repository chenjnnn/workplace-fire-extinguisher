'use client';

/**
 * 倒计时条
 *
 * 用户的要求：「在第五关后的每一关加上倒计时，制造紧急感，
 * 5-10 是每一个任务的倒计时，10 以后是整个关卡的倒计时。」
 *
 * 两种都支持：
 *   · 任务倒计时 —— 每抓完一个隔间重置（第 5-10 关）
 *   · 整关倒计时 —— 不会重置（第 10 关之后）
 *
 * 视觉上做得比较「吵」：最后 10 秒变红 + 跳动，因为它的作用是催人，不是提供信息。
 */

interface Props {
  /** 当前任务剩余秒（0 = 不显示） */
  taskLeft: number;
  taskTotal: number;
  /** 整关剩余秒（0 = 不显示） */
  levelLeft: number;
  levelTotal: number;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `${s}s`;
}

export function Countdown({ taskLeft, taskTotal, levelLeft, levelTotal }: Props) {
  // 整关倒计时优先
  const isLevel = levelTotal > 0;
  const left = isLevel ? levelLeft : taskLeft;
  const total = isLevel ? levelTotal : taskTotal;
  if (total <= 0) return null;

  const ratio = total === 0 ? 0 : Math.min(1, Math.max(0, left / total));
  const urgent = left <= 10;
  const warn = left <= 10 ? '#ef4444' : left <= total * 0.4 ? '#f59e0b' : '#3b82f6';

  return (
    <section className="mt-1.5 shrink-0">
      <div className="flex items-center gap-2">
        <span
          className={`flex items-center gap-1 text-[10px] font-bold ${
            urgent ? 'animate-pulse text-[#ef4444]' : 'text-[#5a5148]'
          }`}
        >
          <span className="text-[11px] leading-none">⏱</span>
          {isLevel ? '整关' : '这一格'}
        </span>

        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/70">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-linear"
            style={{ width: `${ratio * 100}%`, backgroundColor: warn }}
          />
        </div>

        <span
          className={`font-num w-[42px] text-right text-[12px] font-black leading-none ${
            urgent ? 'animate-pulse' : ''
          }`}
          style={{ color: warn }}
        >
          {fmt(left)}
        </span>
      </div>
    </section>
  );
}
