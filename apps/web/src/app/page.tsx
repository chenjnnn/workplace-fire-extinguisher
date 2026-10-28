'use client';

/**
 * 首页 —— 对照参考图重做
 *
 * 布局（参考图那种）：
 *   大标题 → 副标题 → 5 个领导头像横排 + 短标签 → 超大主按钮 → 两个小按钮 → 底部小字
 *
 * 为什么头像要提前露出来：
 *   让玩家进棋盘前就先认一遍这几个脸，不然第一次见会懵。
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_AVATAR,
  TOTAL_LEVELS,
  VILLAINS,
  VILLAIN_ORDER,
  avatarPersona,
  getLevel,
  todayKey,
  type VillainType,
} from '@vc/core';
import { AvatarFigure, VillainTile } from '@/components/art';
import { Tutorial } from '@/components/tutorial';
import { sound } from '@/game/audio';
import { loadSave, persistSave, type SaveData } from '@/lib/save';

/** 首页每天轮换一句的领导语录 */
const DAILY_QUOTES = [
  '年轻人不要总盯着工资，要看重成长。',
  '这个事我不是交代过你吗？',
  '公司就是你的家，家里有事你能不管？',
  '反正你也没什么事吧？今晚弄完。',
  '先做个周报，把进度同步一下我们再讨论。',
  '你能有今天，还不是因为平台给了你机会？',
  '我这个位置，当年也是这么熬过来的。',
  '别人都能做，怎么就你不行？',
];

/** 每个领导的 2-3 字标签 */
const SHORT_LABEL: Record<VillainType, string> = {
  pua: '画饼',
  shirk: '甩锅',
  grafter: '抢功',
  overtime: '逼加班',
  formalist: '走流程',
  flatterer: '拍马屁',
};

export default function HomePage() {
  const [save, setSave] = useState<SaveData | null>(null);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    setSave(loadSave());
  }, []);

  if (!save) {
    return <main className="min-h-screen bg-[#fff8ec]" />;
  }

  const currentLevelId = Math.min(save.progress.unlocked, TOTAL_LEVELS);
  // 每日挑战：第 10 关后解锁；每天的成绩只在当天有效
  const dailyUnlocked = save.progress.unlocked > 10;
  const today = todayKey();
  const dailyRecord = save.daily && save.daily.date === today ? save.daily : null;
  const daily = {
    done: Boolean(dailyRecord?.played),
    best: dailyRecord?.bestScore ?? 0,
  };
  // 加班无尽：通关主线后解锁
  const endlessUnlocked = save.progress.unlocked >= TOTAL_LEVELS;
  const endless = save.endless ?? { bestStage: 0, bestScore: 0 };
  const level = getLevel(currentLevelId);
  const persona = avatarPersona(save.avatar);
  // 和默认形象不一致就算「捏过了」
  const hasCustomAvatar = avatarPersona(save.avatar).title !== avatarPersona(DEFAULT_AVATAR).title;

  const toggleSound = () => {
    const next = !save.soundOn;
    setSave({ ...save, soundOn: next });
    persistSave({ ...save, soundOn: next });
    sound.setEnabled(next);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fff8ec] pb-8">
      {/* 绕页面边框顺时针转的领导（JS 驱动，沿真正的矩形边框走） */}
      <OrbitLeaders />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-12">
        {/* 标题区 */}
        <header className="text-center">
          <h1 className="font-display text-[32px] leading-tight text-[#2e2a24]">
            打飞坏领导
            <span className="text-[#e8623c]">大作战</span>
          </h1>
          <p className="mt-2 text-sm tracking-wide text-[#a89e93]">消除坏领导，解压小休闲</p>
        </header>

        {/* 你的专属领导：DIY 入口，做得显眼 */}
        <section className="mt-6">
          <Link
            href="/avatar/"
            className="flex items-center gap-3 rounded-xl  bg-white/70 px-3 py-2.5 transition active:scale-[0.99]"
          >
            <AvatarFigure avatar={save.avatar} size={54} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-[#3f3a35]">你的专属领导</p>
              <p className="mt-0.5 truncate text-[10px] text-[#a89e93]">
                {persona.title}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#e8623c] px-3 py-1.5 text-[11px] font-bold text-white">
              {hasCustomAvatar ? '重新捏' : '去捏一个'}
            </span>
          </Link>
        </section>

        {/*
          三个模式入口（B 部分）。
          未解锁的卡片显示锁定条件和当前进度，不让点进去。
        */}
        <section className="mt-10 space-y-3">
          {/* 主线任务 */}
          <Link
            href={`/play/?level=${currentLevelId}`}
            className="block rounded-2xl bg-[#e8623c] px-5 py-4 text-white transition active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-[19px] leading-tight">主线任务</p>
                <p className="mt-1 text-[11px] opacity-90">
                  第 {currentLevelId} 关 · {level.name}
                </p>
              </div>
              <div className="text-right">
                <p className="font-num text-[22px] font-black leading-none">
                  {save.progress.unlocked}
                  <span className="text-[13px] font-bold opacity-80">/{TOTAL_LEVELS}</span>
                </p>
                <p className="mt-1 text-[10px] opacity-80">进度</p>
              </div>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${(save.progress.unlocked / TOTAL_LEVELS) * 100}%` }}
              />
            </div>
          </Link>

          {/* 每日挑战：第 10 关后解锁 */}
          {dailyUnlocked ? (
            <Link
              href="/daily/"
              className="block rounded-2xl bg-white px-5 py-4 text-[#3f3a35] transition active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-[17px] leading-tight">每日挑战</p>
                  <p className="mt-1 text-[11px] text-[#a89e93]">
                    {daily.done ? `今天已打卡 · 最高 ${daily.best.toLocaleString()} 分` : '全网同题，一天一局'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                    daily.done ? 'bg-[#dcfce7] text-[#16a34a]' : 'bg-[#fff1e6] text-[#e8623c]'
                  }`}
                >
                  {daily.done ? '已打卡' : '去挑战'}
                </span>
              </div>
            </Link>
          ) : (
            <div className="rounded-2xl bg-white/60 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-[17px] leading-tight text-[#c9bda9]">🔒 每日挑战</p>
                  <p className="mt-1 text-[11px] text-[#c9bda9]">
                    通关第 10 关解锁（{Math.min(save.progress.unlocked, 10)}/10）
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 加班无尽：通关主线后解锁 */}
          {endlessUnlocked ? (
            <Link
              href="/endless/"
              className="block rounded-2xl bg-white px-5 py-4 text-[#3f3a35] transition active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-[17px] leading-tight">加班无尽</p>
                  <p className="mt-1 text-[11px] text-[#a89e93]">
                    {endless.bestStage > 0
                      ? `最远第 ${endless.bestStage} 关 · ${endless.bestScore.toLocaleString()} 分`
                      : '能扛到第几关？'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#ede9fe] px-3 py-1.5 text-[11px] font-bold text-[#7c3aed]">
                  去加班
                </span>
              </div>
            </Link>
          ) : (
            <div className="rounded-2xl bg-white/60 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-[17px] leading-tight text-[#c9bda9]">🔒 加班无尽</p>
                  <p className="mt-1 text-[11px] text-[#c9bda9]">
                    通关第 {TOTAL_LEVELS} 关解锁（{save.progress.unlocked}/{TOTAL_LEVELS}）
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 两个小按钮 */}
        <section className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#6b6259] transition active:scale-95"
          >
            玩法说明
          </button>
          <button
            type="button"
            onClick={toggleSound}
            className="flex items-center gap-1.5 rounded-full border border-[#e5d9c8] bg-white px-5 py-2.5 text-sm font-medium text-[#6b6259] transition active:scale-95"
          >
            <span className="text-base leading-none">{save.soundOn ? '🔊' : '🔇'}</span>
            音效{save.soundOn ? '开' : '关'}
          </button>
        </section>

        {/* 新玩法入口 */}
        <section className="mt-5">
          <Link
            href="/drop/"
            className="flex items-center gap-3 rounded-xl  bg-[#fff8e8] px-3.5 py-3 transition active:scale-[0.99]"
          >
            <span className="text-2xl">🧱</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-[#b45309]">掉落式 · 新玩法</p>
              <p className="mt-0.5 text-[10px] text-[#a88a4a]">
                一组三个往下掉，自己堆出三连
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#f59e0b] px-3 py-1.5 text-[11px] font-bold text-white">
              试试
            </span>
          </Link>
        </section>

        {/* 次入口 */}
        <section className="mt-4 flex justify-center gap-4 text-[12px] text-[#b8a892]">
          <Link href="/levels/" className="hover:text-[#e8623c]">
            关卡选择
          </Link>

        </section>

        {/* 今日领导语录：填充中部空白，每天换一句 */}
        <section className="mt-10">
          <div className="rounded-xl border border-[#efe4d6] bg-white px-4 py-4">
            <p className="text-[11px] font-medium text-[#b8a892]">今日领导语录</p>
            <p className="mt-1.5 text-[14px] font-bold leading-relaxed text-[#3f3a35]">
              「{DAILY_QUOTES[Math.floor(Date.now() / 86400000) % DAILY_QUOTES.length]}」
            </p>
            <p className="mt-1.5 text-[11px] text-[#c9bda9]">
              今天就来消掉说这话的人 ↓
            </p>
          </div>
        </section>

        {/* 底部小字 */}
        <footer className="mt-auto pt-8 text-center">
          <p className="text-[11px] text-[#c9bda9]">交换相邻头像，连成三个即可消除</p>
          <p className="mt-2 text-[10px] text-[#d8cdbd]">
            所有角色均为虚构卡通形象，与真实人物无关
          </p>
        </footer>
      </div>

      {/* 玩法说明（和游戏内的是同一个组件） */}
      {showRules && (
        <Tutorial
          fromMenu
          onDone={() => {
            window.localStorage.setItem('villain-clear:tutorial-seen', '1');
            setShowRules(false);
          }}
        />
      )}
    </main>
  );
}

/**
 * 沿页面边框顺时针绕行的领导头像。
 *
 * 为什么不用 CSS 的 offset-path：
 *   椭圆轨迹必然会穿过屏幕中间，头像会飘到内容上面。
 *   要「贴着边框走」只能用矩形路径，而 CSS 的 path() 又不能响应式，
 *   所以用 rAF 直接算矩形周长上的位置。
 */
function OrbitLeaders() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const doneRef = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    // 走一圈 40 秒
    const PERIOD = 40000;

    const tick = (now: number) => {
      const el = wrapRef.current;
      if (!el) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // 内缩一点，让头像贴着边框内侧走
      const inset = 18;
      const W = w - inset * 2;
      const H = h - inset * 2;
      const perim = 2 * (W + H);
      const t0 = (now - start) / PERIOD;

      itemRefs.current.forEach((node, i) => {
        if (!node) return;
        // 五个头像均分在周长上
        const t = (t0 + i / 5) % 1;
        let d = t * perim;
        let x = 0;
        let y = 0;
        if (d < W) {
          x = d;
          y = 0;
        } else if ((d -= W) < H) {
          x = W;
          y = d;
        } else if ((d -= H) < W) {
          x = W - d;
          y = H;
        } else {
          d -= W;
          x = 0;
          y = H - d;
        }
        node.style.transform = `translate(${x + inset}px, ${y + inset}px)`;
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      {VILLAIN_ORDER.map((type, i) => (
        <div
          key={type}
          ref={(node) => {
            itemRefs.current[i] = node;
          }}
          className="absolute left-0 top-0 will-change-transform"
          style={{ opacity: 0.5 }}
        >
          <div
            ref={(node) => {
              doneRef.current[i] = node;
            }}
            className="-translate-x-1/2 -translate-y-1/2"
          >
            <VillainTile type={type} size={48} />
          </div>
        </div>
      ))}
    </div>
  );
}
