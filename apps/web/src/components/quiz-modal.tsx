'use client';

/**
 * 问答弹窗 —— 领导点名，你当场回怼
 *
 * 盖章动画按用户给的规格实现：
 *
 *   1. 点选项后所有选项锁定，选中项高亮
 *   2. 选中项中心先冒出一个圆形落点阴影（0.1s 快速放大）
 *   3. 印章从落点上方 150px 处开始（scale 1.4 / rotate -12° / opacity 0）
 *      用加速曲线在 0.3s 内砸到落点
 *   4. 落地：scaleY 压到 0.85 再弹回 1 + 弹窗容器震 150ms + 墨迹向四周扩散
 *   5. 印章内容：正确 = 绿色「✓ 正确」；错误 = 红色「✗ 错误」（倾斜更大）
 *   6. 答错时正确答案描边高亮
 *
 * 印章停留 0.8 秒后弹奖励卡，期间不能重复提交。
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { VillainType } from '@vc/core';
import { VillainTile } from '@/components/art';

interface Result {
  granted: { name: string; icon: string; effectText: string; desc: string } | null;
  verdict: { title: string; detail: string; grade: 'good' | 'meh' | 'bad' } | null;
  stars: number;
  gainedScore: number;
  correctIndex: number;
}

interface Props {
  prompt: string;
  bossName: string;
  bossType: VillainType;
  options: Array<{ text: string; reaction: string }>;
  onAnswer: (index: number) => void;
  onClose: () => void;
  result: Result | null;
}

/** 印章落地时刻（与 CSS 里 stampFall 的时长对齐） */
const LAND_AT = 300;
/** 落地后停 0.8 秒再弹奖励卡 */
const CARD_DELAY = LAND_AT + 800;

export function QuizModal({ prompt, bossName, bossType, options, onAnswer, onClose, result }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const [showStamp, setShowStamp] = useState(false);
  const [showCard, setShowCard] = useState(false);
  /** 落地那一瞬间给弹窗加抖动 */
  const [shake, setShake] = useState(false);

  // 换题就重置
  useEffect(() => {
    setPicked(null);
    setShowStamp(false);
    setShowCard(false);
    setShake(false);
  }, [prompt]);

  const choose = (i: number) => {
    // 锁死重复提交
    if (picked !== null) return;
    setPicked(i);
    onAnswer(i);

    // 落点阴影先出来，紧接着印章下坠
    window.setTimeout(() => setShowStamp(true), 110);
    // 落地：容器抖一下（150ms）
    window.setTimeout(() => setShake(true), LAND_AT + 20);
    window.setTimeout(() => setShake(false), LAND_AT + 180);
    // 停 0.8 秒再弹奖励卡
    window.setTimeout(() => setShowCard(true), CARD_DELAY);
  };

  const answered = picked !== null && result !== null;
  const isCorrect = result?.verdict?.grade === 'good';

  const stampText = isCorrect ? '✓ 正确' : '✗ 错误';
  const stampColor = isCorrect ? '#1f7a4d' : '#b3403f';
  const stampBg = isCorrect ? 'rgba(198,240,216,0.95)' : 'rgba(250,212,212,0.95)';
  /** 正确「正盖」，错误歪一点 */
  const stampTilt = isCorrect ? -8 : 12;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2e2a24]/45 px-4 backdrop-blur-[2px]">
      <div className={`relative w-full max-w-sm rounded-2xl bg-white p-4 ${shake ? 'stamp-shake' : ''}`}>
        {/* 领导说话 */}
        <div className="flex items-start gap-2.5">
          <VillainTile type={bossType} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-[#8a8177]">{bossName}</p>
            <p className="mt-0.5 text-[14px] font-bold leading-snug text-[#2e2a24]">
              「{prompt}」
            </p>
          </div>
        </div>

        {/* 选项 */}
        <div className="mt-3 space-y-1.5">
          {options.map((opt, i) => {
            const chosen = picked === i;
            const locked = picked !== null;
            const showRightRing = answered && !isCorrect && result.correctIndex === i;

            return (
              <button
                key={i}
                type="button"
                disabled={locked}
                onClick={() => choose(i)}
                className={`relative w-full rounded-xl py-2.5 pl-3 text-left text-[14px] leading-snug transition ${
                  chosen && showStamp ? 'pr-[92px]' : 'pr-3'
                } ${
                  chosen
                    ? 'bg-[#ffe0d6] font-bold text-[#2e2a24]'
                    : locked
                      ? 'bg-[#f7ede0] text-[#b8a892]'
                      : 'bg-[#f7ede0] text-[#3f3a35] active:scale-[0.99]'
                }`}
                style={
                  showRightRing
                    ? { boxShadow: 'inset 0 0 0 2px #2e8b57', backgroundColor: '#eafaf1' }
                    : undefined
                }
              >
                <span className={chosen && showStamp ? 'opacity-55' : ''}>{opt.text}</span>

                {/* 落点阴影 + 印章 + 墨迹 */}
                {chosen && showStamp && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="stamp-shadow" />
                    <span
                      className="stamp block"
                      style={{ '--tilt': `${stampTilt}deg`, color: stampColor } as CSSProperties}
                    >
                      <span
                        className="stamp-face block whitespace-nowrap rounded-md border-[3px] px-2.5 py-1 text-[17px] font-black tracking-wider"
                        style={{ borderColor: stampColor, backgroundColor: stampBg }}
                      >
                        {stampText}
                      </span>
                    </span>
                    <span className="ink-burst" style={{ color: stampColor }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 奖励卡：印章停稳后弹出来 */}
        {showCard && result && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#2e2a24]/45 p-4">
            <div className="reward-card w-full rounded-2xl bg-white p-4 text-center">
              <div className="flex justify-center gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="reward-star text-[26px] leading-none"
                    style={{ animationDelay: `${i * 90}ms` }}
                  >
                    {i < result.stars ? '⭐' : '☆'}
                  </span>
                ))}
              </div>

              <p className="mt-2 text-[12px] text-[#a89e93]">本回合得分</p>
              <p className="font-display text-[30px] leading-tight text-[#ff6b4a]">
                +{result.gainedScore}
              </p>

              {result.granted ? (
                <div className="mt-2 rounded-xl bg-[#fff0c2] px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[28px] leading-none">{result.granted.icon}</span>
                    <span className="text-[17px] font-bold leading-tight text-[#8a5a10]">
                      {result.granted.name}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[18px] font-display leading-tight text-[#c46a00]">
                    {result.granted.effectText}
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[#a8783a]">
                    {result.granted.desc}
                  </p>
                </div>
              ) : (
                <div className="mt-2 rounded-xl bg-[#f2f2f2] px-3 py-2.5">
                  <p className="text-[13px] text-[#8a8177]">这次没拿到道具</p>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full rounded-full bg-[#ff6b4a] py-3 text-sm font-bold text-white active:scale-[0.98]"
              >
                继续打
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        /* ---------- 落点阴影：0.1s 快速放大 ---------- */
        .stamp-shadow {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 64px;
          height: 18px;
          margin: -9px 0 0 -32px;
          border-radius: 50%;
          background: rgba(40, 30, 20, 0.2);
          transform: scale(0);
          animation: shadowPop 100ms ease-out both;
        }
        @keyframes shadowPop {
          from {
            transform: scale(0);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        /* ---------- 印章：从上方 150px 加速砸下来 ---------- */
        /**
         * 印章：下落 + 落地压扁 + 回弹，合并成一个 keyframes。
         *
         * 之前拆成 stampFall + stampSquash 两个动画，后者带 300ms 延迟和 both 填充，
         * 会在等待期就把 translateY(0) 应用上去，把下落覆盖掉 ——
         * 表现就是「印章直接出现在位置上」，完全看不到砸下来。
         */
        .stamp {
          position: relative;
          transform-origin: center;
          animation: stampDrop 620ms cubic-bezier(0.45, 0, 0.95, 0.55) both;
        }
        @keyframes stampDrop {
          /* 0-48% 下落（约 300ms），加速曲线 */
          0% {
            transform: translateY(-150px) scale(1.4) rotate(var(--tilt, -10deg));
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          48% {
            transform: translateY(0) scale(1) rotate(var(--tilt, -10deg));
            opacity: 1;
          }
          /* 落地压扁 */
          56% {
            transform: translateY(0) scale(1.06, 0.85) rotate(var(--tilt, -10deg));
          }
          /* 回弹 */
          74% {
            transform: translateY(0) scale(0.98, 1.03) rotate(var(--tilt, -10deg));
          }
          100% {
            transform: translateY(0) scale(1) rotate(var(--tilt, -10deg));
            opacity: 1;
          }
        }
        .stamp-face {
          box-shadow: 0 2px 0 rgba(0, 0, 0, 0.06);
        }

        /* ---------- 落地墨迹：向四周扩散淡出 ---------- */
        .ink-burst {
          position: absolute;
          left: 50%;
          top: 100%;
          width: 30px;
          height: 30px;
          margin: -15px 0 0 -15px;
          border-radius: 50%;
          background: radial-gradient(circle, currentColor 0%, transparent 68%);
          opacity: 0;
          animation: inkBurst 460ms ease-out 300ms both;
        }
        @keyframes inkBurst {
          0% {
            transform: scale(0.35);
            opacity: 0.5;
          }
          100% {
            transform: scale(2.6);
            opacity: 0;
          }
        }

        /* ---------- 弹窗容器：落地震 150ms ---------- */
        .stamp-shake {
          animation: containerShake 150ms linear 1;
        }
        @keyframes containerShake {
          0%,
          100% {
            transform: translate(0, 0);
          }
          20% {
            transform: translate(-2px, 1px);
          }
          40% {
            transform: translate(2px, -1px);
          }
          60% {
            transform: translate(-1.5px, -1px);
          }
          80% {
            transform: translate(1.5px, 1px);
          }
        }

        /* ---------- 奖励卡 ---------- */
        .reward-card {
          animation: cardIn 320ms cubic-bezier(0.2, 1.3, 0.4, 1) both;
        }
        @keyframes cardIn {
          0% {
            transform: scale(0.7) translateY(12px);
            opacity: 0;
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
        .reward-star {
          display: inline-block;
          animation: starPop 320ms cubic-bezier(0.2, 1.6, 0.4, 1) both;
        }
        @keyframes starPop {
          0% {
            transform: scale(0) rotate(-40deg);
            opacity: 0;
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
