'use client';

/**
 * 加班无尽入口
 *
 * 显示最高纪录 + 难度递增说明，点「开始加班」进 /play/?endless=1。
 * 死亡重来，从第 1 关重新开始。
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  endlessChainLength,
  endlessMoves,
  endlessTimer,
  endlessModifierCount,
  isBossStage,
} from '@vc/core';
import { loadSave } from '@/lib/save';

export default function EndlessPage() {
  const [mounted, setMounted] = useState(false);
  const [save, setSave] = useState<ReturnType<typeof loadSave> | null>(null);

  useEffect(() => {
    setMounted(true);
    setSave(loadSave());
  }, []);

  if (!mounted || !save) {
    return <main className="min-h-screen bg-[#fff8ec]" />;
  }

  const best = save.endless ?? { bestStage: 0, bestScore: 0 };

  return (
    <main className="min-h-screen bg-[#fff8ec] pb-8">
      <div className="mx-auto w-full max-w-md px-5 pt-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#6b6259] shadow-sm">
            ←
          </Link>
          <h1 className="font-display text-[19px] text-[#2e2a24]">加班到死</h1>
          <div className="w-9" />
        </div>

        <p className="mt-4 text-center text-[11px] text-[#a89e93]">无限关卡 · 死亡重来 · 只记最远的一次</p>

        {/* 纪录 */}
        <section className="mt-5 rounded-2xl bg-white p-4 text-center shadow-sm">
          <p className="text-[11px] font-bold text-[#b8a892]">最高纪录</p>
          <div className="mt-2 flex items-center justify-center gap-6">
            <div>
              <p className="font-num text-[28px] font-black leading-none text-[#7c3aed]">
                {best.bestStage}
              </p>
              <p className="mt-1 text-[10px] text-[#a89e93]">最远关数</p>
            </div>
            <div className="h-8 w-px bg-[#f0e4d4]" />
            <div>
              <p className="font-num text-[28px] font-black leading-none text-[#e8623c]">
                {best.bestScore.toLocaleString()}
              </p>
              <p className="mt-1 text-[10px] text-[#a89e93]">最高分</p>
            </div>
          </div>
        </section>

        {/* 难度递增说明 */}
        <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold text-[#b8a892]">难度会这样涨</p>
          <div className="mt-2 space-y-1.5 text-[11px] text-[#5a5148]">
            {[1, 5, 10, 20].map((s) => (
              <div key={s} className="flex items-center justify-between rounded-lg bg-[#fff8ec] px-3 py-1.5">
                <span className="font-bold">
                  第 {s} 关{isBossStage(s) ? '（Boss）' : ''}
                </span>
                <span className="text-[#8a8177]">
                  {endlessChainLength(s)} 格 · {endlessMoves(s)} 步 ·{' '}
                  {endlessTimer(s) ? `${endlessTimer(s)}s` : '无倒计时'} ·{' '}
                  {endlessModifierCount(s)} 词缀
                </span>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/play/?endless=1"
          className="mt-5 block w-full rounded-full bg-[#7c3aed] py-4 text-center text-[16px] font-black text-white transition active:scale-[0.98]"
        >
          开始加班
        </Link>

        <p className="mt-3 text-center text-[10px] text-[#c9bda9]">每 5 关一个 Boss 波 · 词缀可叠加</p>
      </div>
    </main>
  );
}
