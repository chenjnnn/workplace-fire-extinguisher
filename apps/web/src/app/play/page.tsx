'use client';

/**
 * 游戏页入口
 *
 * 用 `useSearchParams` 在客户端读关卡号，而不是服务端 searchParams ——
 * 因为 next.config 开了 `output: 'export'`（静态导出，方便丢到任意托管/后续小程序 webview），
 * 静态导出下服务端读 searchParams 会导致构建失败。
 * 注意：useSearchParams 必须包在 Suspense 里，否则 next build 预渲染会报错。
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TOTAL_LEVELS, type GameMode } from '@vc/core';
import { PlayClient } from '@/components/play-client';

export default function PlayPage() {
  return (
    <Suspense fallback={<PlayFallback />}>
      <PlayWithParams />
    </Suspense>
  );
}

function PlayWithParams() {
  const params = useSearchParams();
  const raw = Number(params.get('level') ?? '1');
  const levelId = Number.isFinite(raw) ? Math.min(Math.max(1, Math.floor(raw)), TOTAL_LEVELS) : 1;
  const modeParam = params.get('mode');
  // 三种模式都要认；其他值回落到 normal
  const mode: GameMode =
    modeParam === 'catharsis' ? 'catharsis' : modeParam === 'workstation' ? 'workstation' : 'normal';
  // 每日挑战：用日期做种子，全网同一局
  const daily = params.get('daily') === '1';
  return <PlayClient levelId={levelId} mode={mode} daily={daily} />;
}

function PlayFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#38e1ff]" />
    </main>
  );
}
