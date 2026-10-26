'use client';

/**
 * 把程序化美术包成 React 组件
 *
 * 这些组件只负责「画一次的静态图」（角色立绘、牌面预览），
 * 游戏棋盘是 engine.ts 在跑 rAF，两者不混在一起。
 */

import { useEffect, useRef } from 'react';
import type { AvatarConfig, VillainType } from '@vc/core';
import { drawAvatar, drawTileSprite } from '@/game/preload';

function useHiDpiCanvas(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  deps: unknown[],
): React.RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    draw(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

/** 捏的人物立绘 */
export function AvatarFigure({
  avatar,
  size = 160,
  className,
}: {
  avatar: AvatarConfig;
  size?: number;
  className?: string;
}) {
  const ref = useHiDpiCanvas(
    size,
    size,
    (ctx) => {
      drawAvatar(ctx, avatar, size / 2, size / 2, size);
    },
    [avatar, size],
  );

  return <canvas ref={ref} className={className} aria-label="自定义的虚构角色形象" />;
}

/** 一张坏人牌（用于图鉴 / 引导） */
export function VillainTile({
  type,
  variant = 0,
  size = 72,
  className,
}: {
  type: VillainType;
  variant?: number;
  size?: number;
  className?: string;
}) {
  const ref = useHiDpiCanvas(
    size,
    size,
    (ctx) => {
      drawTileSprite(ctx, { type, size, variant });
    },
    [type, size, variant],
  );

  return <canvas ref={ref} className={className} aria-hidden />;
}

/** 一行展示同一类型的 3 个变体，用于图鉴 */
export function VillainVariants({
  type,
  size = 54,
}: {
  type: VillainType;
  size?: number;
}) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((v) => (
        <VillainTile key={v} type={type} variant={v} size={size} />
      ))}
    </div>
  );
}
