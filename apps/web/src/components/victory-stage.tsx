'use client';

/**
 * 通关庆祝动画 —— 巴掌追着一群头像扇
 *
 * 用户的要求：「一群小头像在舞台里乱窜逃跑，一只卡通巴掌追着最近的头像挥过去，
 * 拍中后头像旋转飞出、冒出星星和"啪"字，巴掌停顿回弹，然后继续追下一个头像，循环播放；
 * 动画只是庆祝效果，不参与玩法」
 *
 * 实现取舍：
 *   完全用 CSS 关键帧，不碰 canvas —— 这样它和游戏逻辑完全隔离，
 *   不会拖慢渲染循环，也不会因为暂停/恢复出问题。
 *   每只头像有自己的「逃跑」动画（随机延迟 + 随机路径），
 *   巴掌有一个固定的「追」循环（挥下 → 停 → 回弹）。
 */

import { useMemo } from 'react';
import type { VillainType } from '@vc/core';
import { VillainTile } from '@/components/art';

interface Props {
  /** 用这一关出现过的类型当「逃跑者」 */
  types: VillainType[];
}

/** 逃跑路线：每个头像一组关键帧坐标（百分比） */
/**
 * 逃跑路线。
 *
 * 全部限制在页面上半部分（y 4%~30%）：结算页的分数、统计、按钮都在下面，
 * 头像乱窜到那里会把文字盖住。上半部是标题和星星，盖住也没关系。
 */
const PATHS = [
  { x: '8%', y: '6%', dx: '52%', dy: '14%', dur: '3.1s', delay: '0s' },
  { x: '70%', y: '4%', dx: '-42%', dy: '18%', dur: '3.8s', delay: '0.4s' },
  { x: '20%', y: '24%', dx: '46%', dy: '-14%', dur: '3.4s', delay: '0.9s' },
  { x: '74%', y: '22%', dx: '-36%', dy: '-14%', dur: '4.1s', delay: '0.2s' },
  { x: '42%', y: '14%', dx: '26%', dy: '16%', dur: '3.6s', delay: '1.2s' },
];

export function VictoryStage({ types }: Props) {
  const runners = useMemo(
    () =>
      PATHS.map((p, i) => ({
        ...p,
        type: types[i % Math.max(1, types.length)] ?? ('pua' as VillainType),
        id: i,
      })),
    [types],
  );

  return (
    <div className="victory-stage pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* 逃跑的头像 */}
      {runners.map((r) => (
        <div
          key={r.id}
          className="runner absolute"
          style={{
            left: r.x,
            top: r.y,
            ['--dx' as string]: r.dx,
            ['--dy' as string]: r.dy,
            animationDuration: r.dur,
            animationDelay: r.delay,
          }}
        >
          <VillainTile type={r.type} size={44} />
        </div>
      ))}

      {/* 追着拍的巴掌 */}
      <div className="chaser absolute">
        <span className="slap-emoji">🖐️</span>
        <span className="slap-word">啪！</span>
      </div>

      <style jsx>{`
        /* ---------- 头像：在舞台里乱窜 ---------- */
        .runner {
          opacity: 0.92;
          filter: drop-shadow(0 3px 5px rgba(70, 50, 30, 0.28));
          animation-name: flee;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          animation-direction: alternate;
          will-change: transform;
        }
        @keyframes flee {
          0% {
            transform: translate(0, 0) rotate(0deg);
          }
          35% {
            transform: translate(var(--dx), calc(var(--dy) * 0.4)) rotate(14deg);
          }
          70% {
            transform: translate(calc(var(--dx) * 0.5), var(--dy)) rotate(-12deg);
          }
          100% {
            transform: translate(var(--dx), var(--dy)) rotate(8deg);
          }
        }

        /* ---------- 巴掌：在舞台中央偏右的位置循环挥 ---------- */
        .chaser {
          left: 50%;
          top: 17%;
          animation: chaseMove 3.2s ease-in-out infinite;
        }
        @keyframes chaseMove {
          0% {
            transform: translate(-140%, -50%) rotate(-20deg);
          }
          30% {
            transform: translate(-50%, -50%) rotate(-8deg);
          }
          /* 挥下去 */
          42% {
            transform: translate(-10%, -40%) rotate(24deg) scale(1.15);
          }
          /* 停顿回弹 */
          52% {
            transform: translate(-16%, -46%) rotate(6deg) scale(0.98);
          }
          70% {
            transform: translate(-20%, -50%) rotate(-4deg) scale(1);
          }
          100% {
            transform: translate(-140%, -50%) rotate(-20deg);
          }
        }

        .slap-emoji {
          display: block;
          font-size: 68px;
          line-height: 1;
          filter: drop-shadow(0 3px 4px rgba(60, 40, 20, 0.22));
        }

        /* ---------- 「啪！」字：跟着挥手节奏闪 ---------- */
        .slap-word {
          position: absolute;
          left: 58%;
          top: -6%;
          font-size: 24px;
          font-weight: 900;
          color: #ff4d3d;
          white-space: nowrap;
          transform: rotate(-10deg);
          opacity: 0;
          animation: wordPop 3.2s ease-out infinite;
          text-shadow: 0 1px 0 #fff;
        }
        @keyframes wordPop {
          0%,
          40% {
            opacity: 0;
            transform: rotate(-10deg) scale(0.6);
          }
          45% {
            opacity: 1;
            transform: rotate(-10deg) scale(1.25);
          }
          58% {
            opacity: 1;
            transform: rotate(-10deg) scale(1);
          }
          72%,
          100% {
            opacity: 0;
            transform: rotate(-10deg) scale(1);
          }
        }

        /* 尊重系统的「减少动态效果」设置 */
        @media (prefers-reduced-motion: reduce) {
          .runner,
          .chaser,
          .slap-word {
            animation: none;
          }
          .slap-word {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
