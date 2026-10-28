'use client';

/**
 * 每日挑战入口
 *
 * 展示今天的词缀和「今天是否已打卡」，点「开始挑战」进 /play/?daily=1。
 * 不绑定叙事，纯玩法。
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  MODIFIERS,
  dailyModifierIds,
  createDailyLevel,
  isBossDay,
  dailySeed,
  todayKey,
} from '@vc/core';
import { loadSave } from '@/lib/save';

export default function DailyPage() {
  const [mounted, setMounted] = useState(false);
  const [save, setSave] = useState<ReturnType<typeof loadSave> | null>(null);

  useEffect(() => {
    setMounted(true);
    setSave(loadSave());
  }, []);

  if (!mounted || !save) {
    return <main className="min-h-screen bg-[#fff8ec]" />;
  }

  const seed = dailySeed();
  const boss = isBossDay(seed);
  const level = createDailyLevel();
  const modIds = dailyModifierIds();
  const mods = MODIFIERS.filter((m) => modIds.includes(m.id));
  const today = todayKey();
  const record = save.daily && save.daily.date === today ? save.daily : null;
  const played = Boolean(record?.played);

  return (
    <main className="min-h-screen bg-[#fff8ec] pb-8">
      <div className="mx-auto w-full max-w-md px-5 pt-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#6b6259] shadow-sm">
            ←
          </Link>
          <h1 className="font-display text-[19px] text-[#2e2a24]">每日挑战</h1>
          <div className="w-9" />
        </div>

        <p className="mt-4 text-center text-[11px] text-[#a89e93]">
          {boss ? '今天是 Boss 日 · 两个词缀' : '全网同题 · 每天一局'}
        </p>

        {/* 今天的配置 */}
        <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold text-[#b8a892]">今天的配置</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[#fff8ec] py-2">
              <p className="font-num text-[18px] font-black text-[#3f3a35]">{level.targetChain.length}</p>
              <p className="text-[10px] text-[#a89e93]">格任务</p>
            </div>
            <div className="rounded-xl bg-[#fff8ec] py-2">
              <p className="font-num text-[18px] font-black text-[#3f3a35]">{level.moves}</p>
              <p className="text-[10px] text-[#a89e93]">步数</p>
            </div>
            <div className="rounded-xl bg-[#fff8ec] py-2">
              <p className="font-num text-[18px] font-black text-[#3f3a35]">{level.taskTimerSeconds ?? '—'}</p>
              <p className="text-[10px] text-[#a89e93]">秒/格</p>
            </div>
          </div>

          <p className="mt-3 text-[11px] font-bold text-[#b8a892]">今天的词缀</p>
          <div className="mt-1.5 space-y-1.5">
            {mods.length === 0 && (
              <p className="text-[12px] text-[#c9bda9]">今天没有词缀，纯拼手速。</p>
            )}
            {mods.map((m) => (
              <div key={m.id} className="rounded-xl bg-[#fff1e6] px-3 py-2">
                <p className="text-[12px] font-bold text-[#c2410c]">{m.name}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#8a8177]">{m.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {played && (
          <p className="mt-3 text-center text-[11px] text-[#16a34a]">
            今天已打卡 · 最高 {record?.bestScore.toLocaleString()} 分（可重复挑战刷新纪录）
          </p>
        )}

        <Link
          href="/play/?daily=1"
          className="mt-5 block w-full rounded-full bg-[#e8623c] py-4 text-center text-[16px] font-black text-white transition active:scale-[0.98]"
        >
          {played ? '再打一次' : '开始挑战'}
        </Link>

        <p className="mt-3 text-center text-[10px] text-[#c9bda9]">每天 0 点重置</p>
      </div>
    </main>
  );
}
