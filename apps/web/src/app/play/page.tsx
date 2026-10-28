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
  const modeParam = params.get('mode');
  const mode: GameMode = modeParam === 'catharsis' ? 'catharsis' : 'normal';

  /**
   * 三种关卡来源：
   *   /play/?level=5      → 主线第 5 关
   *   /play/?daily=1      → 今日每日挑战（种子 = 今天日期）
   *   /play/?endless=7    → 无尽模式第 7 关（逐关递增）
   */
  if (params.get('daily')) {
    return <PlayClient levelId={0} mode={mode} runKind="daily" />;
  }

  const endlessStage = Number(params.get('endless') ?? '0');
  if (Number.isFinite(endlessStage) && endlessStage > 0) {
    return (
      <PlayClient
        levelId={0}
        mode={mode}
        runKind="endless"
        stage={Math.floor(endlessStage)}
      />
    );
  }

  const raw = Number(params.get('level') ?? '1');
  const levelId = Number.isFinite(raw) ? Math.min(Math.max(1, Math.floor(raw)), TOTAL_LEVELS) : 1;
  return <PlayClient levelId={levelId} mode={mode} runKind="main" />;
}

function PlayFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#38e1ff]" />
    </main>
  );
}
