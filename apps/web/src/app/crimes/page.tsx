'use client';

/**
 * 罪状簿 —— 长线收集页
 *
 * 每次问答答对，对应的领导会被记一条罪状。
 * 集齐 5 条解锁「终极话术」：消他一个算三个。
 *
 * 为什么这个页面值得存在：
 *   没有它，玩家不知道自己离解锁还差多少，收集就没有目标感。
 *   把「3/5」摆在眼前，才会有人为了集齐故意去答对题。
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CRIMES_TO_UNLOCK, VILLAINS, VILLAIN_ORDER, isUnlocked } from '@vc/core';
import { VillainTile } from '@/components/art';
import { loadSave, type SaveData } from '@/lib/save';

export default function CrimesPage() {
  const [save, setSave] = useState<SaveData | null>(null);

  useEffect(() => {
    setSave(loadSave());
  }, []);

  if (!save) return <div className="min-h-screen bg-[#fff8ec]" />;

  const book = save.crimes ?? {};
  const total = Object.values(book).reduce((a, b) => a + b, 0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-[#fff8ec] px-4 pb-10 pt-5">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#6b6259]"
          aria-label="返回"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl leading-tight text-[#2e2a24]">罪状簿</h1>
          <p className="text-[11px] text-[#a89e93]">答对一次，记一笔</p>
        </div>
        <div className="rounded-xl bg-white px-3 py-1.5 text-center">
          <div className="font-num text-sm leading-none text-[#ff6b4a]">{total}</div>
          <div className="mt-0.5 text-[9px] text-[#b8a892]">总计</div>
        </div>
      </header>

      <p className="mt-3 text-[12px] leading-relaxed text-[#6b6259]">
        每答对一次领导的问题，就会给他说过的话记一条罪状。
        集齐 <b className="text-[#ff6b4a]">{CRIMES_TO_UNLOCK} 条</b>，解锁他的「终极话术」——
        <b className="text-[#2e8b57]">消他一个算三个</b>，推进目标快三倍。
      </p>

      <section className="mt-4 space-y-2">
        {VILLAIN_ORDER.map((type) => {
          const count = book[type] ?? 0;
          const unlocked = isUnlocked(book, type);
          const def = VILLAINS[type];
          const ratio = Math.min(1, count / CRIMES_TO_UNLOCK);

          return (
            <div key={type} className="rounded-xl bg-white p-3">
              <div className="flex items-center gap-3">
                <VillainTile type={type} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <p className="font-display text-[15px] leading-tight text-[#2e2a24]">{def.name}</p>
                    {unlocked && (
                      <span className="rounded-full bg-[#e6f7ee] px-1.5 py-0.5 text-[9px] font-bold text-[#2e8b57]">
                        已解锁
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-[#a89e93]">{def.tagline}</p>

                  {/* 罪状进度 */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0e4d4]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${ratio * 100}%`,
                          backgroundColor: unlocked ? '#2e8b57' : def.color,
                        }}
                      />
                    </div>
                    <span className="font-num text-[11px] leading-none text-[#8a8177]">
                      {count}/{CRIMES_TO_UNLOCK}
                    </span>
                  </div>
                </div>
              </div>

              {unlocked ? (
                <p className="mt-2 rounded-lg bg-[#e6f7ee] px-2.5 py-1.5 text-[11px] leading-relaxed text-[#2e6b4a]">
                  终极话术已解锁：消除{def.name}时，进度按 <b>3 倍</b> 计算。
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-[#b8a892]">
                  还差 {CRIMES_TO_UNLOCK - count} 条 —— 在游戏里答对他的问题就能记一笔。
                </p>
              )}
            </div>
          );
        })}
      </section>

      <div className="mt-5 text-center">
        <Link
          href="/levels/"
          className="inline-block rounded-full bg-[#ff6b4a] px-10 py-3.5 text-[15px] font-display text-white active:scale-95"
        >
          去打一局
        </Link>
      </div>
    </main>
  );
}
