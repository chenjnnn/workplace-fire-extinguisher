'use client';

/**
 * 选关页 —— 「工作计划」报告风
 *
 * 用户的要求：把 10 关塞进「今日计划 / 周计划 / 月计划 / 季度计划」这种
 * 报告式的结构里，用一张计划的形态展示关卡，而不是一排卡片。
 *
 * 设计取舍：
 *   · 分档不是随便分的 —— 今日计划 = 前 5 关（今天要清完的），
 *     周计划 = 后 5 关（这周慢慢来），月计划 / 季度计划是未开放的未来
 *   · 每一档左边一个档位徽章，右边是这一档的关卡点
 *   · 连线用「进度条」表达：通关的段是实色，没通关的是浅色
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LEVELS, MODE_CONFIGS, TOTAL_LEVELS, type GameMode, type VillainType } from '@vc/core';
import { VillainTile } from '@/components/art';
import { loadSave, type SaveData } from '@/lib/save';

/** 计划分档 */
interface PlanGroup {
  id: string;
  title: string;
  range: string;
  levels: number[];
  face: VillainType | null;
  color: string;
  locked?: boolean;
}

const GROUPS: PlanGroup[] = [
  { id: 'today', title: '今日计划', range: '关卡 1-5', levels: [1, 2, 3, 4, 5], face: 'pua', color: '#ff6b4a' },
  { id: 'week', title: '周计划', range: '关卡 6-10', levels: [6, 7, 8, 9, 10], face: 'overtime', color: '#f59e0b' },
  { id: 'month', title: '月计划', range: '即将开启', levels: [], face: null, color: '#a89e93', locked: true },
  { id: 'quarter', title: '季度计划', range: '即将开启', levels: [], face: null, color: '#a89e93', locked: true },
];

export default function LevelsPage() {
  const [save, setSave] = useState<SaveData | null>(null);
  const [mode, setMode] = useState<GameMode>('normal');

  useEffect(() => {
    setSave(loadSave());
    const saved = window.localStorage.getItem('villain-clear:mode');
    if (saved === 'catharsis') setMode('catharsis');
  }, []);

  const changeMode = (next: GameMode) => {
    setMode(next);
    window.localStorage.setItem('villain-clear:mode', next);
  };

  if (!save) return <div className="min-h-screen bg-[#fff8ec]" />;

  const unlocked = save.progress.unlocked;
  const cleared = Math.max(0, unlocked - 1);
  const modeQuery = mode === 'catharsis' ? '&mode=catharsis' : '';

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-[#fff8ec] px-4 pb-10 pt-5">
      {/* 顶栏 */}
      <header className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#6b6259]"
          aria-label="返回"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl leading-tight text-[#2e2a24]">工作计划</h1>
          <p className="text-[11px] text-[#a89e93]">按计划消除坏领导</p>
        </div>
        <div className="rounded-xl bg-white px-3 py-1.5 text-center">
          <div className="font-num text-sm leading-none text-[#ff6b4a]">
            {cleared}
            <span className="text-[10px] text-[#b8a892]">/{TOTAL_LEVELS}</span>
          </div>
          <div className="mt-0.5 text-[9px] text-[#b8a892]">已清</div>
        </div>
      </header>

      {/* 模式切换 */}
      <section className="mt-4 flex gap-2">
        {(Object.keys(MODE_CONFIGS) as GameMode[]).map((key) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => changeMode(key)}
              className="flex-1 rounded-xl py-2 text-[12px] font-bold transition"
              style={{
                backgroundColor: active ? '#ff6b4a' : '#ffffff',
                color: active ? '#ffffff' : '#8a8177',
              }}
            >
              {MODE_CONFIGS[key].name}
            </button>
          );
        })}
      </section>

      {/* 计划表 */}
      <section className="mt-4 space-y-3">
        {GROUPS.map((group) => {
          const groupCleared = group.levels.filter((id) => id < unlocked).length;
          const groupTotal = group.levels.length;
          const ratio = groupTotal === 0 ? 0 : groupCleared / groupTotal;

          return (
            <div key={group.id} className="rounded-xl bg-white p-3">
              {/* 档位标题 */}
              <div className="flex items-center gap-2.5">
                {group.face ? (
                  <VillainTile type={group.face} size={40} />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5efe7] text-base text-[#b8a892]">
                    🔒
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className="font-display text-[15px] leading-tight"
                    style={{ color: group.locked ? '#a89e93' : '#2e2a24' }}
                  >
                    {group.title}
                  </p>
                  <p className="text-[10px] text-[#a89e93]">{group.range}</p>
                </div>
                {!group.locked && (
                  <span className="font-num text-[12px] text-[#8a8177]">
                    {groupCleared}/{groupTotal}
                  </span>
                )}
              </div>

              {/* 进度线 + 关卡点 */}
              {!group.locked ? (
                <div className="relative mt-3">
                  <div className="absolute left-4 right-4 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#f0e4d4]" />
                  {ratio > 0 && (
                    <div
                      className="absolute left-4 top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-all"
                      style={{
                        width: `calc(${(ratio * 100).toFixed(1)}% - ${ratio * 16}px)`,
                        backgroundColor: group.color,
                      }}
                    />
                  )}

                  <div className="relative flex items-center justify-between">
                    {group.levels.map((id) => {
                      const level = LEVELS.find((l) => l.id === id);
                      if (!level) return null;
                      const isCleared = id < unlocked;
                      const isCurrent = id === unlocked;
                      const isLocked = id > unlocked;

                      const content = (
                        <span
                          className="font-num relative flex h-8 w-8 items-center justify-center rounded-full text-[12px] leading-none transition"
                          style={{
                            backgroundColor: isLocked ? '#f2ece2' : isCleared ? group.color : '#ffffff',
                            color: isLocked ? '#b8a892' : isCleared ? '#ffffff' : group.color,
                            border: isCurrent ? `2px solid ${group.color}` : '2px solid transparent',
                            boxShadow: isCurrent ? `0 0 0 4px ${group.color}22` : 'none',
                          }}
                        >
                          {id}
                        </span>
                      );

                      return isLocked ? (
                        <span key={id} className="cursor-not-allowed">
                          {content}
                        </span>
                      ) : (
                        <Link
                          key={id}
                          href={`/play/?level=${id}${modeQuery}`}
                          aria-label={`第 ${id} 关 ${level.name}`}
                          className="transition active:scale-90"
                        >
                          {content}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-[#c9bda9]">完成周计划后解锁</p>
              )}

              {!group.locked && group.levels.includes(unlocked) && (
                <p className="mt-2.5 text-[11px] text-[#8a8177]">
                  下一关：第 {unlocked} 关 · {LEVELS.find((l) => l.id === unlocked)?.name ?? ''}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* 底部 */}
      <div className="mt-5 text-center">
        <Link
          href={`/play/?level=${Math.min(unlocked, TOTAL_LEVELS)}${modeQuery}`}
          className="inline-block rounded-full bg-[#ff6b4a] px-10 py-3.5 text-[15px] font-display text-white transition active:scale-95"
        >
          开始挑战
        </Link>
        <p className="mt-3 text-[10px] text-[#c9bda9]">
          所有角色均为虚构卡通形象，与真实人物无关
        </p>
      </div>
    </main>
  );
}
