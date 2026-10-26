'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  TOTAL_LEVELS,
  VILLAINS,
  avatarPersona,
  computeStars,
  pickPuaLine,
  pickShowdown,
  showdownBest,
  summarize,
  type GameState,
  type ShareData,
  type VillainType,
} from '@vc/core';
import { loadSave } from '@/lib/save';
import { AvatarFigure } from '@/components/art';
import { VictoryStage } from '@/components/victory-stage';

export function ResultOverlay({
  state,
  share,
  levelId,
  onRestart,
}: {
  state: GameState;
  share: ShareData | null;
  levelId: number;
  onRestart: () => void;
}) {
  const won = state.phase === 'won';
  const summary = summarize(state);
  const stars = computeStars(state);
  const avatar = useMemo(() => loadSave().avatar, []);
  const persona = avatarPersona(avatar);
  const [showShare, setShowShare] = useState(false);
  /** 通关后的「话术对决」：选了一个选项就不再换 */
  const [retort, setRetort] = useState<number | null>(null);

  // 本关最主要的领导类型（用来选话术）
  const mainBoss: VillainType = state.level.types[0] ?? 'pua';
  // 失败：抽一句 PUA；通关：抽一场对决
  const pua = useMemo(() => pickPuaLine(mainBoss, state.totalCleared * 7 + 13), [mainBoss, state.totalCleared]);
  const showdown = useMemo(() => pickShowdown(mainBoss), [mainBoss]);

  const nextLevel = levelId + 1;
  const hasNext = won && nextLevel <= TOTAL_LEVELS;

  return (
    <div className={`animate-in-up relative flex h-[100dvh] flex-col ${won ? 'bg-[#fff3e2]' : 'bg-[#fff8ec]'}`}>
      {/* 通关庆祝：巴掌追着头像扇（纯装饰，不参与玩法） */}
      {won && <VictoryStage types={state.level.types} />}

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pt-4">
      <h1
        className={`text-center text-3xl font-black ${won ? 'text-[#f59e0b]' : 'text-[#4a423b]'}`}
      >
        {won ? '清场完成' : '差一点'}
      </h1>
      <p className="mt-1 text-center text-sm text-[#a89e93]">
        {won
          ? `第 ${levelId} 关 · ${state.level.name}`
          : state.movesLeft <= 0
            ? '步数用完了，再来一次'
            : '再来一次就能清干净'}
      </p>

      {/* 失败：领导 PUA 你 */}
      {!won && (
        <section className="mt-4 rounded-xl  bg-[#fffdf8] p-4">
          <p className="text-[11px] font-medium text-[#a89e93]">
            {VILLAINS[pua.from ?? mainBoss].name} 说：
          </p>
          <p className="mt-1 text-[15px] font-bold leading-relaxed text-[#3f3a35]">
            「{pua.text}」
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#b8a892]">{pua.subtext}</p>
        </section>
      )}

      {/* 通关：话术对决 */}
      {won && (
        <section className="mt-4 rounded-xl  bg-[#fffdf8] p-4">
          <div className="flex items-center gap-2">
            {/* 用玩家自己捏的形象当「对手」，这一战才有代入感 */}
            <AvatarFigure avatar={avatar} size={40} className="shrink-0" />
            <p className="text-[11px] font-medium text-[#b45309]">
              {VILLAINS[showdown.boss].name} 说：
            </p>
          </div>
          <p className="mt-1 text-[15px] font-bold leading-relaxed text-[#3f3a35]">
            「{showdown.taunt}」
          </p>

          <p className="mt-3 text-[11px] font-medium text-[#a89e93]">你怎么回？</p>
          <div className="mt-1.5 space-y-1.5">
            {showdown.options.map((option, idx) => {
              const chosen = retort === idx;
              const picked = retort !== null;
              const isBest = option.bonus === showdownBest(showdown);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={picked}
                  onClick={() => setRetort(idx)}
                  className={`w-full rounded-xl border-2 px-3 py-2 text-left text-[13px] leading-snug transition ${
                    chosen
                      ? 'border-[#f59e0b] bg-[#fff3d6] font-semibold text-[#3f3a35]'
                      : picked
                        ? 'border-[#efe4d6] text-[#c9bda9]'
                        : 'border-[#efe4d6] bg-white text-[#5a5148] hover:border-[#fbbf24]'
                  }`}
                >
                  {option.text}
                  {picked && isBest && (
                    <span className="ml-1 rounded bg-[#10b981] px-1 text-[9px] font-bold text-[#3f3a35]">
                      最佳
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {retort !== null && showdown.options[retort] && (
            <div className="mt-2.5 rounded-xl bg-[#f7ede0] p-3">
              <p className="text-[11px] leading-relaxed text-[#5a5148]">
                {showdown.options[retort]!.reaction}
              </p>
            </div>
          )}
        </section>
      )}

      {/* 星星 */}
      <div className="mt-4 flex items-center justify-center gap-3">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`text-4xl transition-all duration-500 ${
              n <= stars ? 'scale-110 text-[#ffc93c] glow-text' : 'scale-90 text-[#e5d9c8]'
            }`}
            style={{ transitionDelay: `${n * 140}ms` }}
          >
            ★
          </span>
        ))}
      </div>

      {/* 分数 */}
      <div className="mt-3 rounded-xl bg-white/92 px-5 py-4 text-center shadow-sm">
        <p className="text-[11px] uppercase tracking-widest text-[#b8a892]">本局得分</p>
        <p className="mt-1 text-4xl font-black tabular-nums text-[#3f3a35]">{state.score.toLocaleString()}</p>
        <p className="mt-1 text-xs text-[#b8a892]">
          三星线 {state.level.starScores[2].toLocaleString()} 分
        </p>
      </div>

      {/* 救援结果：这是本局最该被看见的事 */}
      {state.rescues.length > 0 && (
        <div className="mt-3 rounded-xl bg-white/92 px-4 shadow-sm">
          <div className="py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-[#a89e93]">救援结果</span>
              <span className="text-[11px] font-medium">
                <span className="text-[#4ade80]">{summary.rescuedCount} 人获救</span>
                {summary.lostCount > 0 && (
                  <span className="ml-2 text-[#ff5c7a]">{summary.lostCount} 人失守</span>
                )}
              </span>
            </div>
            <div className="space-y-1.5">
              {state.rescues.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      r.status === 'rescued'
                        ? 'bg-[#4ade80] text-black'
                        : r.status === 'lost'
                          ? 'bg-[#ff5c7a] text-black'
                          : 'bg-white/15 text-[#8b8177]'
                    }`}
                  >
                    {r.status === 'rescued' ? '✓' : r.status === 'lost' ? '✕' : '·'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[#5a5148]">{r.name}</span>
                  <span className="shrink-0 text-[11px] text-[#b8a892]">
                    {r.status === 'rescued'
                      ? '已解救'
                      : r.status === 'lost'
                        ? '救援失败'
                        : `${r.progress}/${r.needed}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 明细 */}
      <div className="mt-3 rounded-xl bg-white/92 px-4 shadow-sm">
        <Row label="清理总数" value={`${summary.totalCleared} 个`} />
        <Row label="最高连锁" value={`${summary.maxChain} 连`} />
        <Row label="收网行动" value={`${summary.sweepUsed} 次`} />
        {state.rescues.length > 0 && (
          <Row
            label="救援评分"
            value={
              summary.lostCount === 0
                ? '完美救援'
                : `损失 ${summary.lostCount} 人（星级上限 ${Math.max(1, 3 - summary.lostCount)}）`
            }
          />
        )}
        {share && share.breakdown.length > 0 && (
          <div className="py-3">
            <p className="mb-2 text-xs text-[#b8a892]">按类型</p>
            <div className="flex flex-wrap gap-1.5">
              {share.breakdown.map((b) => (
                <span
                  key={b.type}
                  className="rounded-full border px-2.5 py-1 text-xs font-medium"
                  style={{ borderColor: `${b.color}55`, color: b.color, backgroundColor: `${b.color}12` }}
                >
                  {b.name} × {b.count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 人设 */}
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/92 px-4 py-3 shadow-sm">
        <AvatarFigure avatar={avatar} size={56} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-[#b8a892]">你的虚构角色</p>
          <p className="mt-0.5 text-sm leading-snug text-[#5a5148]">{persona.title}</p>
        </div>
      </div>

      {showShare && share && (
        <div className="px-4">
          <ShareCard share={share} />
        </div>
      )}

      <p className="mt-4 px-4 text-center text-[10px] leading-relaxed text-[#c9bda9]">
        {share?.disclaimer}
      </p>
      </div>

      {/*
        底部操作栏：固定在屏幕底部，永远可见。
        之前按钮是接在内容流后面的 —— 结算内容比屏幕高，按钮被顶到屏幕外，
        而游戏页又给 body 加了 overflow:hidden，玩家根本滚不到，直接卡死。
      */}
      <div className="relative z-10 shrink-0 border-t border-[#f0e4d4] bg-white px-4 pb-4 pt-3">
        <div className="space-y-2">
          {/* 主按钮：通关是「下一关」，失败是「再来一次」 */}
          {hasNext ? (
            <Link
              href={`/play/?level=${nextLevel}`}
              className="block w-full rounded-full bg-[#ff6b4a] py-3.5 text-center text-[15px] font-display text-white active:scale-[0.98]"
            >
              下一关 · 第 {nextLevel} 关
            </Link>
          ) : (
            <button
              type="button"
              onClick={onRestart}
              className="w-full rounded-full bg-[#ff6b4a] py-3.5 text-[15px] font-display text-white active:scale-[0.98]"
            >
              {won ? '再玩一次' : '再来一次'}
            </button>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onRestart}
              className="rounded-full bg-[#f7ede0] py-2.5 text-[12px] font-bold text-[#5a5148] active:scale-95"
            >
              重玩本关
            </button>
            <button
              type="button"
              onClick={() => setShowShare((v) => !v)}
              className="rounded-full bg-[#f7ede0] py-2.5 text-[12px] font-bold text-[#5a5148] active:scale-95"
            >
              分享
            </button>
            <Link
              href="/levels/"
              className="rounded-full bg-[#f7ede0] py-2.5 text-center text-[12px] font-bold text-[#5a5148] active:scale-95"
            >
              选关
            </Link>
          </div>

          <Link
            href="/"
            className="block w-full rounded-full py-1.5 text-center text-[11px] text-[#8a8177]"
          >
            返回主菜单
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-[#a89e93]">{label}</span>
      <span className="font-semibold tabular-nums text-[#3f3a35]">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------- 分享卡
function ShareCard({ share }: { share: ShareData }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const W = 720;
    const H = 960;
    const dpr = 2;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // 背景
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#12121f');
    bg.addColorStop(0.5, '#0a0a12');
    bg.addColorStop(1, '#1a0f18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 霓虹光斑
    for (const [x, y, r, color] of [
      [130, 150, 220, 'rgba(56,225,255,0.13)'],
      [600, 300, 260, 'rgba(255,92,122,0.12)'],
      [360, 820, 300, 'rgba(196,107,255,0.1)'],
    ] as Array<[number, number, number, string]>) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 标题
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38e1ff';
    ctx.font = '700 22px system-ui, -apple-system, sans-serif';
    ctx.fillText('坏 蛋 消 消 乐', W / 2, 92);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 46px system-ui, -apple-system, sans-serif';
    ctx.fillText(share.title, W / 2, 168);

    // 星星
    ctx.font = '700 52px system-ui, sans-serif';
    const starY = 250;
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i < share.stars ? '#ffc93c' : 'rgba(255,255,255,0.12)';
      ctx.fillText('★', W / 2 + (i - 1) * 76, starY);
    }

    // 分数
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 84px system-ui, sans-serif';
    ctx.fillText(share.score.toLocaleString(), W / 2, 372);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText('总分', W / 2, 406);

    // 分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(90, 448);
    ctx.lineTo(W - 90, 448);
    ctx.stroke();

    // 数据
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText('清理坏蛋', W / 2 - 180, 506);
    ctx.fillText('最高连锁', W / 2 + 180, 506);

    ctx.fillStyle = '#ff5c7a';
    ctx.font = '900 58px system-ui, sans-serif';
    ctx.fillText(String(share.totalCleared), W / 2 - 180, 572);
    ctx.fillStyle = '#ffc93c';
    ctx.fillText(`${share.maxChain}`, W / 2 + 180, 572);

    // 分类明细
    let y = 640;
    ctx.font = '700 21px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (const item of share.breakdown.slice(0, 5)) {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(110, y - 7, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillText(item.name, 132, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = item.color;
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.fillText(`× ${item.count}`, W - 110, y);
      ctx.font = '700 21px system-ui, sans-serif';
      ctx.textAlign = 'left';
      y += 40;
    }

    // 人设
    if (share.persona) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '500 19px system-ui, sans-serif';
      ctx.fillText(share.persona.title, W / 2, 830);
    }

    // 免责声明
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '500 15px system-ui, sans-serif';
    wrapText(ctx, share.disclaimer, W / 2, 890, W - 140, 22);

    setDataUrl(canvas.toDataURL('image/png'));
  }, [share]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `打飞坏领导-${share.date}.png`;
    a.click();
  };

  return (
    <div className="mt-3 rounded-xl bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs text-[#a89e93]">长按图片保存，或点下载</p>
      {dataUrl ? (
        <img src={dataUrl} alt="成绩分享海报" className="w-full rounded-xl" />
      ) : (
        <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-[#f7ede0]" />
      )}
      <button type="button" onClick={download} className="btn bg-[#f7ede0] text-[#5a5148] mt-2 w-full !py-2 !text-xs">
        下载图片
      </button>
    </div>
  );
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const chars = [...text];
  let line = '';
  let cursorY = y;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cursorY);
      line = ch;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}
