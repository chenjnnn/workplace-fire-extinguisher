'use client';

/**
 * 玩法说明 —— 首次进游戏时自动弹一次
 *
 * 用户的要求：2-3 页卡片依次介绍「目标、操作、失败条件」，
 * 每页有图标和一句话说明，底部「上一步 / 下一步 / 跳过」，
 * 最后一页是「开始游戏」；看完或跳过后用 localStorage 记住，不再自动弹。
 */

import { useState } from 'react';

interface Props {
  onDone: () => void;
  /** 从主菜单主动打开时，显示「关闭」而不是「开始游戏」 */
  fromMenu?: boolean;
}

interface Page {
  icon: string;
  title: string;
  desc: string;
  /** 小示意图：用 emoji 拼一行 */
  demo?: string;
}

const PAGES: Page[] = [
  {
    icon: '🎯',
    title: '目标：把坏领导关进囚车',
    desc: '交换相邻头像，三个同类连成一线就消除。清够目标数量就通关。',
    demo: '🚔 ▢▢▢▢▢▢▢▢',
  },
  {
    icon: '👆',
    title: '操作：拖动或点选两个头像',
    desc: '相邻的两个头像可以交换位置。凑不出三连的交换会自动换回来。',
    demo: '🖐️ ⇄ 😈',
  },
  {
    icon: '⏳',
    title: '限时：每一格都有倒计时',
    desc: '第 6 关起才有倒计时，每格独立计时。超时：第一次扣 1 步、第二次扣 2 步、第三次才失败。',
    demo: '⏱ 1️⃣ −1步　2️⃣ −2步　3️⃣ 失败',
  },
  {
    icon: '😤',
    title: '两个不好惹的角色',
    desc: '加班魔被消掉时反咬一口扣 7 分（会飘字）；抢功精有两条命，第一次只掉血、外圈出现白圈，第二次才清掉。',
    demo: '🔴 反咬 −7　🟡 ◔ 白圈=还欠一命',
  },
];

export function Tutorial({ onDone, fromMenu = false }: Props) {
  const [page, setPage] = useState(0);
  const isLast = page === PAGES.length - 1;
  const current = PAGES[page]!;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2e2a24]/55 px-5 backdrop-blur-[2px]">
      <div className="animate-in-up w-full max-w-sm rounded-2xl bg-white p-5">
        {/* 进度点 */}
        <div className="flex justify-center gap-1.5">
          {PAGES.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === page ? 18 : 6,
                backgroundColor: i === page ? '#ff6b4a' : '#e0d3c0',
              }}
            />
          ))}
        </div>

        {/* 图标 */}
        <div className="mt-4 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#fff3e8] text-[38px]">
            {current.icon}
          </div>
        </div>

        {/* 标题 + 说明 */}
        <h2 className="mt-4 text-center font-display text-[19px] leading-snug text-[#2e2a24]">
          {current.title}
        </h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-[#6b6259]">
          {current.desc}
        </p>

        {/* 小示意图 */}
        {current.demo && (
          <div className="mt-3 rounded-xl bg-[#f7ede0] py-2.5 text-center text-[15px] tracking-[0.14em] text-[#8a8177]">
            {current.demo}
          </div>
        )}

        {/* 按钮 */}
        <div className="mt-5 space-y-2">
          {isLast ? (
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-full bg-[#ff6b4a] py-3.5 text-[15px] font-display text-white active:scale-[0.98]"
            >
              {fromMenu ? '知道了' : '开始游戏'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPage((v) => Math.min(PAGES.length - 1, v + 1))}
              className="w-full rounded-full bg-[#ff6b4a] py-3.5 text-[15px] font-display text-white active:scale-[0.98]"
            >
              下一步
            </button>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((v) => Math.max(0, v - 1))}
              className="flex-1 rounded-full bg-[#f7ede0] py-2.5 text-[12px] font-bold text-[#5a5148] disabled:opacity-40"
            >
              上一步
            </button>
            <button
              type="button"
              onClick={onDone}
              className="flex-1 rounded-full bg-[#f7ede0] py-2.5 text-[12px] font-bold text-[#5a5148]"
            >
              {fromMenu ? '关闭' : '跳过'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
