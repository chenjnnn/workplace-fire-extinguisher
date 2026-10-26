'use client';

/**
 * 掉落式消消乐 —— 界面
 *
 * 操作：
 *   · ← → 左右移动这一组
 *   · ↓ 加速下落
 *   · 空格 / 「落下」按钮：直接砸到底
 *   · 也可以滑屏
 *
 * 为什么显示「影子」（落点预览）：
 *   玩家要判断「放这一列会不会形成三连」，靠想象太累。
 *   有影子就直接看到落点，决策成本大幅降低。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  VILLAINS,
  createDropGame,
  dropProgress,
  fallingCells,
  ghostRow,
  hardDrop,
  moveGroup,
  tickDrop,
  type DropState,
  type VillainType,
} from '@vc/core';
import { VillainTile } from '@/components/art';

const CONFIG = {
  cols: 7,
  rows: 12,
  types: ['pua', 'shirk', 'overtime', 'grafter'] as VillainType[],
  target: 15,
};

/** 自动下落间隔（毫秒） */
const TICK_MS = 620;

export default function DropPage() {
  const [state, setState] = useState<DropState | null>(null);
  const [flash, setFlash] = useState<{ text: string; kind: 'good' | 'bad' | 'info' } | null>(null);
  const [paused, setPaused] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const reset = useCallback(() => {
    setState(createDropGame(CONFIG, Date.now() % 100000));
    setFlash(null);
    setPaused(false);
  }, []);

  useEffect(() => {
    reset();
  }, [reset]);

  const showFlash = useCallback((text: string, kind: 'good' | 'bad' | 'info') => {
    setFlash({ text, kind });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1100);
  }, []);

  // 自动下落
  useEffect(() => {
    if (!state || state.status !== 'playing' || paused) return;
    const timer = window.setInterval(() => {
      setState((prev) => {
        if (!prev || prev.status !== 'playing') return prev;
        const { state: next, result } = tickDrop(prev);
        if (result.cleared && result.cleared > 0) {
          showFlash(
            result.chain && result.chain >= 2
              ? `${result.chain} 连锁！+${next.score - prev.score}`
              : `消除 ${result.cleared} 个`,
            'good',
          );
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [state?.status, paused, showFlash, state]);

  const move = useCallback((dir: -1 | 1) => {
    setState((prev) => {
      if (!prev || prev.status !== 'playing') return prev;
      return moveGroup(prev, dir).state;
    });
  }, []);

  const drop = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.status !== 'playing') return prev;
      const { state: next, result } = hardDrop(prev);
      if (result.cleared && result.cleared > 0) {
        showFlash(
          result.chain && result.chain >= 2
            ? `${result.chain} 连锁！+${next.score - prev.score}`
            : `消除 ${result.cleared} 个`,
          'good',
        );
      }
      if (next.status === 'won') showFlash('通关！', 'good');
      if (next.status === 'lost') showFlash('堆到顶了', 'bad');
      return next;
    });
  }, [showFlash]);

  // 键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        drop();
      } else if (e.key === ' ') {
        e.preventDefault();
        drop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, drop]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
    else if (dy > 0) drop();
  };

  if (!state) return <main className="min-h-screen bg-[#fff8ec]" />;

  const progress = dropProgress(state);
  const ghost = ghostRow(state);
  const falling = fallingCells(state);
  const finished = state.status !== 'playing';

  return (
    <main className="min-h-screen bg-[#fff8ec] pb-6">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pt-4">
        {/* 顶栏 */}
        <header className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#6b6259] shadow-sm"
            aria-label="返回"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg text-[#3f3a35]">掉落式</h1>
            <p className="text-[11px] text-[#a89e93]">把三个同类堆到一起</p>
          </div>
          <div className="rounded-xl bg-white px-3 py-1.5 text-center shadow-sm">
            <div className="text-[10px] text-[#b8a892]">得分</div>
            <div className="text-sm font-black tabular-nums text-[#3f3a35]">{state.score}</div>
          </div>
        </header>

        {/* 进度 */}
        <section className="mt-3 rounded-xl bg-white px-3 py-2 shadow-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-medium text-[#8b8177]">距离通关</span>
            <span className="text-[11px] font-bold tabular-nums text-[#3f3a35]">
              {progress.current}
              <span className="text-[#b8a892]"> / {progress.total}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#f0e4d4]">
            <div
              className="h-full rounded-full bg-[#ff6b4a] transition-all duration-200"
              style={{ width: `${Math.min(100, progress.ratio * 100)}%` }}
            />
          </div>
        </section>

        {/* 棋盘 */}
        <section
          className="mt-3"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="relative rounded-xl bg-white p-1.5 shadow-sm">
            <div
              className="grid gap-px"
              style={{ gridTemplateColumns: `repeat(${CONFIG.cols}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: CONFIG.rows }).map((_, r) =>
                Array.from({ length: CONFIG.cols }).map((__, c) => {
                  const cell = state.board[r]?.[c];
                  // 影子只标「落点那一格」，不要把整列都画成虚线
                  const isGhost =
                    ghost !== null &&
                    !cell &&
                    r === ghost &&
                    falling.some((f) => f.col === c);
                  return (
                    <div
                      key={`${r}-${c}`}
                      className="relative flex aspect-square items-center justify-center"
                    >
                      {cell ? (
                        <VillainTile type={cell.type} size={40} />
                      ) : isGhost ? (
                        <div className="h-3/4 w-3/4 rounded-full border-2 border-dashed border-[#d8cbb8]" />
                      ) : (
                        <div className="h-1/2 w-1/2 rounded-full bg-[#f7f0e6]" />
                      )}
                    </div>
                  );
                }),
              )}
            </div>

            {/* 正在下落的组：绝对定位盖在棋盘上 */}
            <div className="pointer-events-none absolute inset-1.5">
              <div
                className="grid h-full"
                style={{ gridTemplateColumns: `repeat(${CONFIG.cols}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: CONFIG.rows }).map((_, r) =>
                  Array.from({ length: CONFIG.cols }).map((__, c) => {
                    const f = falling.find((x) => x.row === r && x.col === c);
                    if (!f) return <div key={`${r}-${c}`} />;
                    return (
                      <div key={`${r}-${c}`} className="flex aspect-square items-center justify-center">
                        <div className="animate-pulse">
                          <VillainTile type={f.tile.type} size={40} />
                        </div>
                      </div>
                    );
                  }),
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-[#b8a892]">
            左右移动 · 点「落下」或按空格直接砸到底
          </p>
        </section>

        {/* 下一组 */}
        <section className="mt-3 flex items-center justify-center gap-3">
          <span className="text-[11px] text-[#b8a892]">下一组</span>
          <div className="flex gap-1.5 rounded-xl bg-white px-2 py-1.5 shadow-sm">
            {state.nextTypes.map((t, i) => (
              <VillainTile key={i} type={t} size={30} />
            ))}
          </div>
        </section>

        {/* 操作按钮 */}
        <section className="mt-3 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={finished}
            className="flex h-14 w-16 items-center justify-center rounded-xl bg-white text-xl font-bold text-[#5a5148] shadow-sm transition active:scale-90 disabled:opacity-40"
          >
            ←
          </button>
          <button
            type="button"
            onClick={drop}
            disabled={finished}
            className="flex h-14 flex-1 items-center justify-center rounded-xl bg-[#e8623c] text-sm font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-40"
          >
            落下
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={finished}
            className="flex h-14 w-16 items-center justify-center rounded-xl bg-white text-xl font-bold text-[#5a5148] shadow-sm transition active:scale-90 disabled:opacity-40"
          >
            →
          </button>
        </section>
      </div>

      {/* 浮动提示 */}
      {flash && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4">
          <div
            className={`animate-in-up rounded-full px-3 py-1.5 text-[13px] font-bold shadow-sm ${
              flash.kind === 'good'
                ? 'bg-[#3f6212] text-white'
                : flash.kind === 'bad'
                  ? 'bg-[#f43f5e] text-white'
                  : 'bg-[#3f3a35] text-white'
            }`}
          >
            {flash.text}
          </div>
        </div>
      )}

      {/* 结算 */}
      {finished && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#3f3a35]/35 p-4 backdrop-blur-sm sm:items-center">
          <div className="animate-in-up w-full max-w-sm rounded-xl bg-white p-5">
            <h2
              className={`text-center font-display text-2xl ${
                state.status === 'won' ? 'text-[#3f6212]' : 'text-[#e8623c]'
              }`}
            >
              {state.status === 'won' ? '通关！' : '堆满了'}
            </h2>
            <p className="mt-1 text-center text-xs text-[#a89e93]">{state.endReason}</p>

            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-[#fffaf0] py-2">
                <div className="text-lg font-black tabular-nums text-[#3f3a35]">{state.score}</div>
                <div className="text-[10px] text-[#a89e93]">得分</div>
              </div>
              <div className="rounded-xl bg-[#fffaf0] py-2">
                <div className="text-lg font-black tabular-nums text-[#3f3a35]">{state.cleared}</div>
                <div className="text-[10px] text-[#a89e93]">已消除</div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={reset}
                className="w-full rounded-xl bg-[#e8623c] py-3 text-sm font-bold text-white transition active:scale-95"
              >
                再来一局
              </button>
              <Link
                href="/"
                className="block w-full rounded-xl bg-[#f7ede0] py-2.5 text-center text-sm font-semibold text-[#5a5148]"
              >
                回首页
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
