'use client';

import { useEffect } from 'react';

/**
 * 连击奖励卡
 *
 * 用户的要求：「删掉问题卡这一功能，改成连着完成两次任务给一定的分数奖励，
 * 连着完成 4 次给一定的步数奖励，通过跳过键完成的任务不算，
 * 奖励的形式还是以功能卡的形式出现」。
 *
 * 所以这个组件只负责「展示奖励 + 关闭」，不再有题目和选项。
 * 视觉沿用原来奖励卡的样式（大图标 + 标题 + 效果），保持手感一致。
 */

interface Props {
  reward: { kind: 'score' | 'moves'; amount: number; streak: number };
  onClose: () => void;
}

export function RewardModal({ reward, onClose }: Props) {
  const isScore = reward.kind === 'score';

  /**
   * A11：奖励卡不再阻塞操作。
   *
   * 之前是模态弹窗，必须点「继续打」才消失，还停表。
   * 现在 2 秒后自动关，不拦点击（pointer-events-none），也不停表 ——
   * 只有暂停菜单才停表。
   */
  useEffect(() => {
    const t = window.setTimeout(onClose, 2000);
    return () => window.clearTimeout(t);
  }, [onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-6">
      <div className="animate-in-up w-full max-w-[280px] rounded-2xl bg-white/96 p-4 text-center shadow-xl">
        {/* 连击数 */}
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: reward.streak }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: i === reward.streak - 1 ? '#ff6b4a' : '#ffc93c' }}
            />
          ))}
          <span className="ml-1 text-[10px] font-bold text-[#a89e93]">
            连续完成 {reward.streak} 次
          </span>
        </div>

        {/* 图标 */}
        <div
          className="mx-auto mt-3 flex h-[72px] w-[72px] items-center justify-center rounded-2xl text-[36px]"
          style={{ backgroundColor: isScore ? '#fff3e8' : '#eef4ff' }}
        >
          {isScore ? '💰' : '👟'}
        </div>

        {/* 标题 */}
        <h2 className="mt-3 font-display text-[19px] leading-snug text-[#2e2a24]">
          {isScore ? '效率翻倍' : '偷到时间'}
        </h2>

        {/* 效果 */}
        <div
          className="mt-2 rounded-xl px-3 py-2.5"
          style={{ backgroundColor: isScore ? '#fff3e8' : '#eef4ff' }}
        >
          <p
            className="font-num text-[20px] font-black leading-none"
            style={{ color: isScore ? '#c2410c' : '#1d4ed8' }}
          >
            {isScore ? '+' : '+'}
            {reward.amount}
            {isScore ? ' 分' : ' 步'}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#8a8177]">
            {isScore
              ? '连着两个任务都没拖泥带水，领导开始有点慌。'
              : '连着四个任务一口气干完，你居然还多出一点时间。'}
          </p>
        </div>

      </div>
    </div>
  );
}
