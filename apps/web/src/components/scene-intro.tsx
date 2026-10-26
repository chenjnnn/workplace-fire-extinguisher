'use client';

/**
 * 开场动画 —— 替代静态任务卡
 *
 * 分三幕，每幕自动推进，最后停在「开打」：
 *
 *   第一幕  领导从右侧滑入 → 说出他的第一句话（打字机）
 *   第二幕  场景描写淡入
 *   第三幕  任务高亮 → 开打按钮弹出
 *
 * 为什么是动画而不是一张卡：
 *   静态卡是「读一段文字再点按钮」，动画是「看见一个人走进来对你说了一句话」。
 *   后者才有「我为什么现在要打他」的动机。
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { LevelConfig, LevelScene, VillainType } from '@vc/core';
import { VILLAINS } from '@vc/core';
import { VillainTile } from '@/components/art';

interface Props {
  level: LevelConfig;
  /** 随机挑中的场景（同一关可能有多个变体） */
  scene: LevelScene;
  onStart: () => void;
}

/** 每关场景的背景色（纯色块，不用渐变） */
const SCENE_BG = [
  '#cfe8ff', // 入职培训室
  '#ffdcc7', // 会议室
  '#e4d4ff', // 工位区
  '#ffd0d9', // 大会议室
  '#ffe9b8', // 述职厅
  '#c9f0d9', // 团建基地
  '#d6d9ff', // 小会议室
  '#ffdfb8', // HR 办公室
  '#d3dce6', // 会议室门外
  '#ffd2c4', // 公司门口
];

type Stage = 'enter' | 'line' | 'desc' | 'task' | 'ready';

export function SceneIntro({ level, scene, onStart }: Props) {
  const [stage, setStage] = useState<Stage>('enter');
  const [typed, setTyped] = useState('');
  const timer = useRef<number | null>(null);

  const boss: VillainType = level.types[0] ?? 'pua';
  const bg = SCENE_BG[(level.id - 1) % SCENE_BG.length] ?? '#fff0e6';

  // 第一幕：领导滑入（450ms）→ 开始打字
  useEffect(() => {
    const t1 = window.setTimeout(() => setStage('line'), 450);
    return () => window.clearTimeout(t1);
  }, []);

  // 打字机
  useEffect(() => {
    if (stage !== 'line') return;
    const full = scene.line;
    let i = 0;
    const tick = () => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i < full.length) {
        timer.current = window.setTimeout(tick, 52);
      } else {
        // 台词说完了，进入第二幕
        timer.current = window.setTimeout(() => setStage('desc'), 400);
      }
    };
    timer.current = window.setTimeout(tick, 120);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [stage, scene.line]);

  // 第二幕 → 第三幕
  useEffect(() => {
    if (stage !== 'desc') return;
    const t = window.setTimeout(() => setStage('task'), 900);
    return () => window.clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'task') return;
    const t = window.setTimeout(() => setStage('ready'), 500);
    return () => window.clearTimeout(t);
  }, [stage]);

  // 点击任意处跳过动画
  const skip = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setTyped(scene.line);
    setStage('ready');
  };

  const descVisible = stage === 'desc' || stage === 'task' || stage === 'ready';
  const taskVisible = stage === 'task' || stage === 'ready';
  const ready = stage === 'ready';

  return (
    <main
      className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-[#fff8ec]"
      onClick={skip}
    >
      {/* 场景底色：整屏铺满，底部用一层浅色地面收口（无渐变、无阴影） */}
      <div className="absolute inset-0 transition-colors duration-500" style={{ backgroundColor: bg }} />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: '30%',
          backgroundColor: '#fff8ec',
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
        }}
      />

      <div className="relative z-10 flex min-h-[100dvh] flex-col px-5 pt-10">
        {/* 关卡序号 */}
        <p className="text-center text-[11px] font-semibold tracking-widest text-[#2e2a24]/45">
          第 {level.id} 关 · {scene.name}
        </p>

        {/* 领导入场 */}
        <div className="relative mt-4 flex justify-center">
          <div
            className="transition-all duration-500"
            style={{
              transform: stage === 'enter' ? 'translateX(150%)' : 'translateX(0)',
              opacity: stage === 'enter' ? 0 : 1,
            }}
          >
            <div className="relative">
              <VillainTile type={boss} size={88} />
              {/* 对话气泡的小尾巴 */}
              <div
                className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1.5 rotate-45"
                style={{ backgroundColor: '#ffffff' }}
              />
            </div>
          </div>
        </div>

        {/* 台词气泡 */}
        <div
          className="relative mt-4 rounded-xl bg-white px-4 py-3 transition-all duration-400"
          style={{
            opacity: stage === 'enter' ? 0 : 1,
            transform: stage === 'enter' ? 'translateY(8px)' : 'translateY(0)',
          }}
        >
          <p className="min-h-[52px] text-[18px] font-bold leading-relaxed text-[#2e2a24]">
            {typed}
            {/* 光标 */}
            {stage === 'line' && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#ff6b4a] align-middle" />
            )}
          </p>
          <p className="mt-1 text-[11px] text-[#8a8177]">—— {VILLAINS[boss].name}</p>
        </div>

        {/* 场景描写 */}
        <div
          className="mt-4 transition-all duration-500"
          style={{
            opacity: descVisible ? 1 : 0,
            transform: descVisible ? 'translateY(0)' : 'translateY(10px)',
          }}
        >
          <p className="text-[16px] leading-relaxed text-[#4a423b]">{scene.desc}</p>
        </div>

        {/* 任务 */}
        <div
          className="mt-5 transition-all duration-400"
          style={{
            opacity: taskVisible ? 1 : 0,
            transform: taskVisible ? 'translateY(0)' : 'translateY(10px)',
          }}
        >
          <div className="rounded-xl bg-[#fff0c2] px-4 py-3">
            <p className="text-[10px] font-bold tracking-wide text-[#b45309]">你的任务</p>
            <p className="mt-1 text-[14px] font-bold leading-relaxed text-[#2e2a24]">
              {scene.mission}
            </p>
          </div>
        </div>

        {/* 开打 + 底栏 */}
        <div className="mt-6 pb-6">
          <div className="mb-3 flex items-center justify-center gap-2 text-[11px] text-[#8a8177]">
            <span>{level.moves} 步</span>
            <span className="text-[#d8cbb8]">·</span>
            <span>
              {level.goals
                .map((g) => (g.type === 'any' ? (g.label ?? '清掉所有坏蛋') : VILLAINS[g.type].name))
                .join(' / ')}
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStart();
            }}
            className="w-full rounded-full bg-[#ff6b4a] py-4 text-lg font-display text-white transition-transform active:scale-[0.97]"
            style={{
              opacity: ready ? 1 : 0,
              transform: ready ? 'scale(1)' : 'scale(0.94)',
              transitionProperty: 'opacity, transform',
              transitionDuration: '320ms',
              pointerEvents: ready ? 'auto' : 'none',
            }}
          >
            开打
          </button>

          <Link
            href="/levels/"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 block text-center text-[12px] text-[#8a8177]"
          >
            回去选关
          </Link>
        </div>
      </div>
    </main>
  );
}
