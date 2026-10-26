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
import { PrisonVan } from '@/components/prison-van';
import { RescueBar } from '@/components/rescue-bar';
import { SceneIntro } from '@/components/scene-intro';
import { Tutorial } from '@/components/tutorial';
import { QuizModal } from '@/components/quiz-modal';

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

export function PlayClient({
  levelId,
  mode = 'normal',
  daily = false,
}: {
  levelId: number;
  mode?: GameMode;
  /** 每日挑战：同一天全网同一局 */
  daily?: boolean;
}) {
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
  /** 问答：选完之后的结果 */
  const [quizResult, setQuizResult] = useState<{
    granted: { name: string; icon: string; effectText: string; desc: string } | null;
    verdict: { title: string; detail: string; grade: 'good' | 'meh' | 'bad' } | null;
    stars: number;
    gainedScore: number;
    correctIndex: number;
  } | null>(null);
  /**
   * 当前正在展示的题。
   *
   * 为什么不能直接用 hud.pendingQuiz：
   * 答题后引擎会立刻清空 pendingQuiz，弹窗会瞬间消失，
   * 玩家根本看不到「我选对了吗、拿到了什么」。
   * 所以弹窗出现时把题目快照下来，直到玩家点「继续打」才释放。
   */
  const [activeQuiz, setActiveQuiz] = useState<NonNullable<HudSnapshot['pendingQuiz']> | null>(null);

  useEffect(() => {
    if (hud?.pendingQuiz && activeQuiz === null) {
      setActiveQuiz(hud.pendingQuiz);
      setQuizResult(null);
    }
  }, [hud?.pendingQuiz, activeQuiz]);
  const [finished, setFinished] = useState<GameState | null>(null);
  const [share, setShare] = useState<ShareData | null>(null);
  const [avatar, setAvatar] = useState<AvatarConfig | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

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
      daily,
      avatar: save.avatar,
      onHud: (snapshot) => setHud(snapshot),
      onToast: (msg) => setToast(msg),
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

  if (finished) {
    return (
      <main className="mx-auto flex h-[100dvh] w-full max-w-md flex-col">
        <ResultOverlay
          state={finished}
          share={share}
          levelId={levelId}
          onRestart={restart}
        />
      </main>
    );
  }

  // 开场动画：领导入场 → 说一句话 → 任务浮现 → 开打
  if (!briefed) {
    return <SceneIntro level={level} scene={scene} onStart={() => setBriefed(true)} />;
  }

  const quiz = activeQuiz;
  const showQuiz = quiz !== null;

  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-md flex-col bg-[#fff8ec] px-3 pb-2 pt-2">
      {showQuiz && (
        <QuizModal
          prompt={quiz.prompt}
          bossName={quiz.bossName}
          bossType={quiz.bossType}
          options={quiz.options}
          result={quizResult}
          onAnswer={(i) => {
            const r = engineRef.current?.answerQuizOption(i) ?? null;
            // 答对了就立刻把罪状写进存档（不等结算，避免中途退出丢掉）
            if (r?.correct) {
              const engine = engineRef.current;
              const board = engine?.getCrimeBook?.();
              if (board) {
                const next = loadSave();
                next.crimes = board as Record<string, number>;
                persistSave(next);
              }
            }
            setQuizResult(
              r
                ? {
                    granted: r.granted,
                    verdict: r.verdict,
                    stars: r.stars,
                    gainedScore: r.gainedScore,
                    correctIndex: r.correctIndex,
                  }
                : null,
            );
          }}
          onClose={() => {
            setActiveQuiz(null);
            setQuizResult(null);
          }}
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
        {/* 怒值：纯显示。真正的「收网」按钮在囚车旁边的警笛上 */}
        <div className="flex flex-1 flex-col justify-center rounded-xl bg-white px-3 py-2">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] text-[#b8a892]">怒值</p>
            <p
              className="font-num text-[11px] leading-none"
              style={{ color: hud?.canSweep ? '#f97316' : '#b8a892' }}
            >
              {Math.round(((hud?.rage ?? 0) / (hud?.rageMax || 100)) * 100)}%
            </p>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#f0e4d4]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, ((hud?.rage ?? 0) / (hud?.rageMax || 100)) * 100)}%`,
                backgroundColor: hud?.canSweep ? '#ff6b4a' : '#ffc93c',
              }}
            />
          </div>
          {hud?.canSweep && (
            <p className="mt-1 text-[9px] font-bold leading-none text-[#f97316]">
              怒值已满 · 可以收网
            </p>
          )}
        </div>
      </section>

      {/* 救援场景：上方是「有人正被侵害」，下方棋盘去救他 */}
      <RescueBar rescues={hud?.rescues ?? []} />

      {/* 囚车：把「还差几个」变成「已经关进去几个」 */}
      <PrisonVan
        goals={hud?.goals ?? []}
        canSweep={hud?.canSweep ?? false}
        sweepLeft={Math.max(0, (hud?.sweepLimit ?? 0) - (hud?.sweepUsed ?? 0))}
        onSweep={sweep}
      />


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

