'use client';

/**
 * 游戏页 —— 画布 + HUD + 结算
 *
 * 注意：真正的游戏循环在 engine.ts 里，这个组件只负责：
 *   1. 挂载/销毁引擎
 *   2. 把引擎的 HUD 快照渲染成 React 界面
 *   3. 处理结算、重开、返回
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MODE_CONFIGS,
  buildShareData,
  computeStars,
  getLevel,
  type AvatarConfig,
  type GameMode,
  type GameState,
  type ShareData,
  VILLAINS,
  pickScene,
} from '@vc/core';
import type { VillainType } from '@vc/core';
import { GameEngine, type HudSnapshot } from '@/game/engine';
import { sound } from '@/game/audio';
import { applyLevelResult, loadSave, persistSave } from '@/lib/save';
import { ResultOverlay } from '@/components/result';
import { AvatarFigure } from '@/components/art';
import { Countdown } from '@/components/countdown';
import { PrisonVan } from '@/components/prison-van';
import { RescueBar } from '@/components/rescue-bar';
import { SceneIntro } from '@/components/scene-intro';
import { Tutorial } from '@/components/tutorial';
import { RewardModal } from '@/components/reward-modal';

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'bad' | 'plain';
}) {
  const color =
    tone === 'good' ? '#10b981' : tone === 'bad' ? '#f43f5e' : '#8b8177';
  return (
    <div className="flex-1 rounded-xl bg-white px-2 py-1.5 text-center shadow-sm">
      <div className="text-sm font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] text-[#b8a892]">{label}</div>
    </div>
  );
}

export function PlayClient({ levelId, mode = 'normal' }: { levelId: number; mode?: GameMode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  /** 开场任务卡：先看场景和任务，点「开始」才进游戏 */
  const [briefed, setBriefed] = useState(false);
  /** 游戏内菜单（暂停 / 重开 / 退出） */
  const [menuOpen, setMenuOpen] = useState(false);
  /** 玩法说明：第一次玩自动弹，之后可以用主菜单的「玩法」重看 */
  const [showTutorial, setShowTutorial] = useState(false);
  /** 二次确认：重开 / 返回主菜单 都先问一句 */
  const [confirmAction, setConfirmAction] = useState<'restart' | 'exit' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('villain-clear:tutorial-seen') !== '1') {
      setShowTutorial(true);
    }
  }, []);
  // 连击数变大 → 盖一个章
  useEffect(() => {
    const streak = hud?.taskStreak ?? 0;
    // ×1 没意义（还没形成连击），从 ×2 开始盖
    if (streak >= 2 && streak > lastStreakRef.current) {
      setStreakStamp({ n: streak, key: Date.now() });
      const t = window.setTimeout(() => setStreakStamp(null), 620);
      lastStreakRef.current = streak;
      return () => window.clearTimeout(t);
    }
    lastStreakRef.current = streak;
    return undefined;
  }, [hud?.taskStreak]);

  // 奖励卡打开期间暂停倒计时
  useEffect(() => {
    engineRef.current?.setUiPaused((hud?.pendingReward ?? null) !== null);
  }, [hud?.pendingReward]);
  const [finished, setFinished] = useState<GameState | null>(null);
  const [share, setShare] = useState<ShareData | null>(null);
  const [avatar, setAvatar] = useState<AvatarConfig | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  /**
   * 连击盖章提示。
   *
   * 用户要求：「连击加一个短暂的弹出提示，就是显示乘 1 乘 2 这样子，
   * 也用那个盖章的表现形式」。
   * 所以每次 taskStreak 变大就盖一个 ×N 的章，600ms 后自动消失。
   */
  const [streakStamp, setStreakStamp] = useState<{ n: number; key: number } | null>(null);
  const lastStreakRef = useRef(0);

  const level = getLevel(levelId);
  /**
   * 场景随机种子。
   *
   * 注意：不能在 render 里直接用 Date.now() —— 服务端渲染和客户端 hydration
   * 会算出不同的场景，React 会报 hydration mismatch 并重建整棵树。
   * 所以放在 effect 里生成，SSR 时先用默认场景。
   */
  const [sceneSeed, setSceneSeed] = useState<number | null>(null);
  useEffect(() => {
    setSceneSeed(Date.now());
  }, []);
  const scene = sceneSeed === null ? level.scene : pickScene(level, sceneSeed);
  const modeConfig = MODE_CONFIGS[mode];

  // 读档 + 初始化音效
  useEffect(() => {
    const save = loadSave();
    setAvatar(save.avatar);
    setSoundOn(save.soundOn);
    sound.setEnabled(save.soundOn);
  }, []);

  // 挂载引擎
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    document.body.classList.add('game-locked');
    const save = loadSave();

    const engine = new GameEngine({
      canvas,
      levelId,
      mode,
      avatar: save.avatar,
      onHud: (snapshot) => setHud(snapshot),
      onFinish: (state) => {
        const nextSave = applyLevelResult(
          loadSave(),
          levelId,
          computeStars(state),
          state.score,
          state.totalCleared,
          state.maxChain,
        );
        persistSave(nextSave);
        setFinished(state);
        setShare(buildShareData(state, nextSave.avatar));
      },
    });
    engineRef.current = engine;

    /**
     * 换关（点「下一关」）时 Next 的客户端路由不会重新挂载这个组件，
     * 所以 finished 会留着上一关的结算数据 ——
     * 表现就是「点下一关，直接进下一关的结算页」。
     * 这里在引擎重建（= 换关）时清空。
     */
    setFinished(null);
    setShare(null);

    return () => {
      document.body.classList.remove('game-locked');
      engine.destroy();
      engineRef.current = null;
    };
  }, [levelId, mode, briefed]);

  const restart = useCallback(() => {
    setFinished(null);
    setShare(null);
    engineRef.current?.restart();
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    sound.setEnabled(next);
    const save = loadSave();
    persistSave({ ...save, soundOn: next });
  }, [soundOn]);

  const sweep = useCallback(() => {
    const ok = engineRef.current?.sweep();
    if (!ok) setToast('怒值还没满，再清几波');
    else setToast(null);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(timer);
  }, [toast]);


  /**
   * 结算页撤掉后，棋盘容器才恢复真实尺寸 —— 这时候必须重算一次画布。
   *
   * 之前只在 engine.restart() 里量尺寸，但那是结算页按钮触发的，
   * 此刻结算页还盖着、容器高度是 0，结果 canvas 退回默认的 300×150，
   * 玩家看到「上面有任务、下面没有格子」。
   * 这里等两帧 + 一个 timeout，保证 DOM 已经切回游戏视图。
   */
  useEffect(() => {
    if (finished) return;
    const engine = engineRef.current;
    if (!engine) return;

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => engine.relayout());
    });
    const timer = window.setTimeout(() => engine.relayout(), 160);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
    };
  }, [finished]);

  // 结算页内容很长，需要能滚动 —— 解除「禁止滚动」的锁
  useEffect(() => {
    if (!finished) return;
    document.body.classList.remove('game-locked');
    return () => {
      // 回到游戏时重新锁上
      document.body.classList.add('game-locked');
    };
  }, [finished]);

  // Esc 关闭菜单（暂停时也能继续）
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // 菜单打开时暂停引擎，关掉再恢复
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (menuOpen) engine.pause();
    else engine.resume();
  }, [menuOpen]);

  // 玩法说明：第一次进游戏时最先弹，看完才进开场动画
  if (showTutorial) {
    return (
      <Tutorial
        onDone={() => {
          window.localStorage.setItem('villain-clear:tutorial-seen', '1');
          setShowTutorial(false);
        }}
      />
    );
  }

  // 开场动画：领导入场 → 说一句话 → 任务浮现 → 开打
  if (!briefed) {
    return <SceneIntro level={level} scene={scene} onStart={() => setBriefed(true)} />;
  }

  const reward = hud?.pendingReward ?? null;

  return (
    <main className="relative mx-auto flex h-[100dvh] w-full max-w-md flex-col bg-[#fff8ec] px-3 pb-2 pt-2">
      {/*
        结算页用「叠层」而不是「替换」。
        之前是 early return，结算时整个游戏视图（包括 canvas 元素）被卸载，
        而引擎还绑在旧 canvas 上 —— 点「重玩」后 React 建了一个新 canvas，
        引擎却不知道，结果棋盘停在默认的 300×150，玩家看到「上面有任务、下面没格子」。
      */}
      {finished && (
        <div className="absolute inset-0 z-40">
          <ResultOverlay
            state={finished}
            share={share}
            levelId={levelId}
            onRestart={restart}
          />
        </div>
      )}

      {/* 连击奖励卡（取代原来的问答卡） */}
      {reward && (
        <RewardModal
          reward={reward}
          onClose={() => engineRef.current?.clearReward()}
        />
      )}

      {/* 顶栏 */}
      <header className="flex shrink-0 items-center justify-between gap-2 px-1">
        <Link
          href="/levels/"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#6b6259] shadow-sm"
          aria-label="返回关卡选择"
        >
          ←
        </Link>

        {avatar && <AvatarFigure avatar={avatar} size={36} className="shrink-0" />}

        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-sm font-bold text-[#3f3a35]">
            第 {level.id} 关 · {level.name}
          </h1>
          <p className="truncate text-[10px] text-[#a89e93]">
            {modeConfig.name} · {level.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-white px-2.5 text-[12px] font-bold text-[#6b6259]"
          aria-label="打开菜单"
        >
          <span className="text-[15px] leading-none">☰</span>
          <span className="leading-none">菜单</span>
        </button>
      </header>

      {/* 暂停面板：点遮罩或按 Esc 也能继续 */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2e2a24]/55 px-6 backdrop-blur-[2px]"
          onClick={() => setMenuOpen(false)}
          role="presentation"
        >
          <div
            className="animate-in-up w-full max-w-xs rounded-2xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="游戏暂停"
          >
            <p className="text-center font-display text-[20px] text-[#2e2a24]">已暂停</p>
            <p className="mt-1 text-center text-[11px] text-[#a89e93]">
              第 {level.id} 关 · {level.name}
            </p>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="w-full rounded-full bg-[#ff6b4a] py-3 text-sm font-bold text-white active:scale-[0.98]"
              >
                继续游戏
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction('restart')}
                className="w-full rounded-full bg-[#f7ede0] py-3 text-sm font-bold text-[#5a5148] active:scale-[0.98]"
              >
                重新开始
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction('exit')}
                className="w-full rounded-full bg-[#f7ede0] py-3 text-sm font-bold text-[#5a5148] active:scale-[0.98]"
              >
                返回主菜单
              </button>
            </div>

            <p className="mt-3 text-center text-[10px] text-[#b8a892]">
              点空白处或按 Esc 也能继续
            </p>
          </div>
        </div>
      )}

      {/* 二次确认 */}
      {confirmAction && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2e2a24]/60 px-6">
          <div className="animate-in-up w-full max-w-xs rounded-2xl bg-white p-5">
            <p className="text-center font-display text-[17px] text-[#2e2a24]">
              {confirmAction === 'restart' ? '重新开始这一关？' : '返回主菜单？'}
            </p>
            <p className="mt-1.5 text-center text-[12px] leading-relaxed text-[#8a8177]">
              {confirmAction === 'restart'
                ? '本局进度会清空，从第 1 步重来。'
                : '本局分数和进度会清空，最高分和已解锁关卡会保留。'}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 rounded-full bg-[#f7ede0] py-2.5 text-[13px] font-bold text-[#5a5148]"
              >
                取消
              </button>
              {confirmAction === 'restart' ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmAction(null);
                    setMenuOpen(false);
                    restart();
                  }}
                  className="flex-1 rounded-full bg-[#ff6b4a] py-2.5 text-[13px] font-bold text-white"
                >
                  确认重开
                </button>
              ) : (
                <Link
                  href="/levels/"
                  className="flex-1 rounded-full bg-[#ff6b4a] py-2.5 text-center text-[13px] font-bold text-white"
                >
                  确认返回
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HUD */}
      <section className="mt-2 flex shrink-0 items-stretch gap-2">
        <div className="flex-1 rounded-xl bg-white px-3 py-2 shadow-sm">
          <p className="text-[10px] text-[#b8a892]">得分</p>
          <p className="text-xl font-black leading-tight text-[#3f3a35] tabular-nums">
            {(hud?.score ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="flex-1 rounded-xl bg-white px-3 py-2 shadow-sm">
          <p className="text-[10px] text-[#b8a892]">剩余步数</p>
          <p
            className={`text-xl font-black leading-tight tabular-nums ${
              (hud?.movesLeft ?? 0) <= 5 ? 'text-[#f43f5e]' : 'text-[#3f3a35]'
            }`}
          >
            {hud?.movesLeft ?? 0}
          </p>
        </div>
        {/* 跳过进度：两个门槛，攒够就能跳一格（圆环在囚车右边按钮上） */}
        <div className="flex flex-1 flex-col justify-center rounded-xl bg-white px-3 py-2">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] text-[#b8a892]">跳过进度</p>
            <p
              className="font-num text-[10px] leading-none"
              style={{ color: hud?.canSweep ? '#ff6b4a' : '#b8a892' }}
            >
              {hud?.canSweep ? '可用！' : `${hud?.score ?? 0}/${hud?.sweepNextScore ?? 0}`}
            </p>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#f0e4d4]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.round((hud?.sweepRatio ?? 0) * 100)}%`,
                backgroundColor: hud?.canSweep ? '#ff6b4a' : '#ffc93c',
              }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[8px] leading-none text-[#c9bda9]">
              {(hud?.sweepThresholds ?? [0, 0]).map((t, i) => (
                <span
                  key={i}
                  className="font-num"
                  style={{ color: (hud?.sweepEarnedCount ?? 0) > i ? '#2e8b57' : '#c9bda9' }}
                >
                  {i > 0 ? ' · ' : ''}
                  {t}
                </span>
              ))}
            </span>
            <span className="text-[8px] leading-none text-[#c9bda9]">两次</span>
          </div>
        </div>
      </section>

      {/* 救援场景：上方是「有人正被侵害」，下方棋盘去救他 */}
      <RescueBar rescues={hud?.rescues ?? []} />

      {/* 囚车：把「还差几个」变成「已经关进去几个」 */}
      <Countdown
        taskLeft={hud?.taskTimeLeft ?? 0}
        taskTotal={hud?.taskTimeTotal ?? 0}
        levelLeft={hud?.levelTimeLeft ?? 0}
        levelTotal={hud?.levelTimeTotal ?? 0}
      />

      <PrisonVan
        sequence={hud?.sequence ?? []}
        canSweep={hud?.canSweep ?? false}
        sweepThresholds={hud?.sweepThresholds ?? [2500, 5500]}
        sweepEarned={hud?.sweepEarnedCount ?? 0}
        sweepRatio={hud?.sweepRatio ?? 0}
        sweepNextScore={hud?.sweepNextScore ?? 0}
        onSweep={sweep}
      />

      {/* 连击盖章：×1 ×2 ×3 … */}
      {streakStamp && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
          <div key={streakStamp.key} className="streak-stamp">
            <span className="streak-stamp-label">连击</span>
            <span>×{streakStamp.n}</span>
          </div>
        </div>
      )}

      {/* 棋盘 */}
      <section className="relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 棋盘后面的氛围光：让留白看起来是设计，而不是没加载完 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[70%] w-[86%] rounded-full bg-[#38e1ff]/6 blur-3xl" />
        </div>

        {/* 这里必须显式给 h-full/min-h-0：canvas 的尺寸依赖父容器的 clientHeight，
            父容器如果高度由 canvas 自己撑开就会形成循环，棋盘会被算成极小。 */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {/* 这个 relative 包裹层让「清场记录」能贴着 canvas 下沿定位。
              必须给 w-full：否则它的宽度由 canvas 撑开，而 canvas 又按父宽度算尺寸，
              两者互相依赖会把棋盘算得极小。 */}
          <div className="relative flex h-full w-full items-center justify-center">
            <canvas ref={canvasRef} data-testid="game-board" className="rounded-xl" />

            {toast && (
              <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center">
                <span className="animate-in-up rounded-full bg-black/75 px-4 py-1.5 text-xs text-white/90 backdrop-blur">
                  {toast}
                </span>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* 本局战报：把棋盘下方的空白用起来，也让玩家看见自己的决策质量 */}
      <section className="mt-1.5 flex shrink-0 items-center justify-center gap-4 rounded-xl bg-white/70 px-3 py-1">
        <span className="text-[11px] text-[#b8a892]">
          连锁 <b className="tabular-nums text-[#3f3a35]">{hud?.maxChain ?? 0}</b>
        </span>
        <span className="text-[11px] text-[#b8a892]">
          已清 <b className="tabular-nums text-[#3f3a35]">{hud?.totalCleared ?? 0}</b>
        </span>
        <span className="text-[11px] text-[#b8a892]">
          步数 <b className={`tabular-nums ${(hud?.movesLeft ?? 0) <= 5 ? 'text-[#f43f5e]' : 'text-[#3f3a35]'}`}>{hud?.movesLeft ?? 0}</b>
        </span>
      </section>

      {/* 底部提示 */}
      <footer className="mt-2 flex shrink-0 items-center justify-between px-1 text-[11px] text-[#b8a892]">
        <span>拖动或点选相邻两格交换</span>
        <span>看清目标再动手</span>
      </footer>
    </main>
  );
}

