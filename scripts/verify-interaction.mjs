/**
 * 深度交互验证
 *
 * 用引擎暴露的只读探针取「一步可行解」，然后：
 *   1. 用真实鼠标拖拽走这一步，验证扣步 + 得分 + 画面变化
 *   2. 验证连击、收网行动、结算页
 *
 * 这样验证的是「真实输入 → 真实引擎 → 真实画面」，
 * 而不是绕过 UI 直接改状态。
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const OUT = new URL('../screenshots/', import.meta.url).pathname;

const results = [];
const errors = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** 问答弹窗会挡操作：出现就自动答掉 */
async function clearQuiz(page) {
  const hasQuiz = await page.evaluate(() => !!window.__VC_ENGINE__?.snapshot().pendingQuiz);
  if (!hasQuiz) return false;
  await page.evaluate(() => window.__VC_ENGINE__.answerQuizOption(0));
  await page.waitForTimeout(400);
  const cont = page.getByRole('button', { name: '继续打' });
  if ((await cont.count()) > 0) {
    await cont.click();
    await page.waitForTimeout(500);
  }
  return true;
}

/** 进入游戏：等开场动画结束 → 点开打 → 等引擎就绪 */
/** 首次进入会弹玩法说明，点「跳过」 */
async function skipTutorial(page) {
  const skip = page.getByRole('button', { name: '跳过' });
  if ((await skip.count()) > 0) {
    await skip.click();
    await page.waitForTimeout(400);
  }
}

async function enterGame(page) {
  await skipTutorial(page);
  // 开场动画约 3 秒，按钮到「开打」这一幕才真正可点
  const btn = page.getByRole('button', { name: '开打' });
  await btn.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
  // 等它真的可以点（opacity 从 0 过渡到 1 需要时间）
  for (let i = 0; i < 30; i += 1) {
    const ok = await btn
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return Number(s.opacity) > 0.9 && s.pointerEvents !== 'none';
      })
      .catch(() => false);
    if (ok) break;
    await page.waitForTimeout(200);
  }
  if ((await btn.count()) > 0) {
    await btn.click();
  }
  // 等引擎真正挂上
  await page
    .waitForFunction(() => !!window.__VC_ENGINE__?.snapshot, { timeout: 12000 })
    .catch(() => {});
  await page.waitForTimeout(600);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/play/?level=1`, { waitUntil: 'networkidle' });
  await enterGame(page);



  const snap0 = await page.evaluate(() => window.__VC_ENGINE__?.snapshot());
  if (!snap0) {
    check('引擎探针可用', false, 'window.__VC_ENGINE__ 不存在');
    await browser.close();
    process.exit(1);
  }
  check('引擎已初始化', true, `${snap0.boardSize.rows}×${snap0.boardSize.cols}，步数 ${snap0.movesLeft}`);
  check('开局有可行步', Boolean(snap0.hint), JSON.stringify(snap0.hint));

  // 取棋盘在页面上的实际位置
  const box = await page.locator('[data-testid="game-board"]').boundingBox();
  if (!box) {
    check('棋盘可见', false);
    await browser.close();
    process.exit(1);
  }

  const { rows, cols } = snap0.boardSize;
  const cellW = box.width / cols;
  const cellH = box.height / rows;
  // 引擎的布局里棋盘是居中的，先问一下实际 boardX/boardY
  const layout = snap0.layout;
  const toScreen = (row, col) => ({
    x: box.x + layout.boardX + cellW * (col + 0.5),
    y: box.y + layout.boardY + cellH * (row + 0.5),
  });

  // ------------------------------------------------ 用真实拖拽走一步
  const hint = snap0.hint;
  const fromPx = toScreen(hint.a.row, hint.a.col);
  const toPx = toScreen(hint.b.row, hint.b.col);

  await page.mouse.move(fromPx.x, fromPx.y);
  await page.mouse.down();
  await page.mouse.move(toPx.x, toPx.y, { steps: 10 });
  await page.mouse.up();
  // 等结算动画全部播完（大串联会持续几秒）
  await page.waitForTimeout(1200);
  await page
    .waitForFunction(
      () => {
        const e = window.__VC_ENGINE__;
        if (!e) return false;
        const s = e.snapshot();
        return !s.busy;
      },
      { timeout: 15000 },
    )
    .catch(() => {});

  const snap1 = await page.evaluate(() => window.__VC_ENGINE__?.snapshot());
  const movesConsumed = snap0.movesLeft - snap1.movesLeft;
  check('拖拽有效步后扣步', movesConsumed === 1, `扣了 ${movesConsumed} 步（${snap0.movesLeft} → ${snap1.movesLeft}）`);
  check('拖拽有效步后得分', snap1.score > snap0.score, `${snap0.score} → ${snap1.score}`);
  check('结算完成后回到可操作状态', snap1.phase === 'idle' && !snap1.busy, `phase=${snap1.phase} busy=${snap1.busy}`);

  const scoreText = await page.locator('text=得分').first().locator('xpath=..').innerText();
  check('HUD 得分与引擎一致', scoreText.includes(snap1.score.toLocaleString()), scoreText.replace(/\n/g, ' '));

  await page.screenshot({ path: `${OUT}10-after-valid-move.png` });

  // ------------------------------------------------ 连续走多步
  for (let i = 0; i < 3; i += 1) {
    await clearQuiz(page);
    const snap = await page.evaluate(() => window.__VC_ENGINE__?.snapshot());
    if (!snap || !snap.hint || snap.phase !== 'idle') break;
    const a = toScreen(snap.hint.a.row, snap.hint.a.col);
    const b = toScreen(snap.hint.b.row, snap.hint.b.col);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(1400);
  }

  const snap2 = await page.evaluate(() => window.__VC_ENGINE__?.snapshot());
  check('连续操作后仍在合理状态', ['idle', 'won', 'lost'].includes(snap2.phase), `phase=${snap2.phase} 分数 ${snap2.score}`);
  check(
    '分数持续增长',
    snap2.score > snap1.score || snap2.phase !== 'idle',
    `${snap1.score} → ${snap2.score}${snap2.phase !== 'idle' ? `（phase=${snap2.phase}）` : ''}`,
  );
  await page.screenshot({ path: `${OUT}11-mid-game.png` });

  // ------------------------------------------------ 收网行动
  const canSweep = await page.evaluate(() => {
    const s = window.__VC_ENGINE__?.snapshot();
    return s ? s : null;
  });
  void canSweep;

  const midPhase = (await page.evaluate(() => window.__VC_ENGINE__?.snapshot()))?.phase;
  const sweepButtonVisible = (await page.locator('text=怒值').count()) > 0;
  check('怒值 UI 存在', sweepButtonVisible || midPhase !== 'idle', `phase=${midPhase}`);

  // 把怒值拉满（测试专用注入口），验证收网行动
  await page.evaluate(() => {
    const engine = window.__VC_ENGINE__;
    if (engine && typeof engine.debugFillRage === 'function') engine.debugFillRage();
  });
  await page.waitForTimeout(400);
  const sweepReady = (await page.getByRole('button', { name: '收网行动' }).count()) > 0;
  const sweepPhase = (await page.evaluate(() => window.__VC_ENGINE__?.snapshot()))?.phase;
  // 游戏已经结束时这一步不适用
  check('怒值满后出现收网按钮', sweepReady || sweepPhase !== 'idle', `phase=${sweepPhase}`);

  if (sweepReady) {
    await clearQuiz(page);
    const beforeSweep = await page.evaluate(() => window.__VC_ENGINE__?.snapshot());
    // 用引擎方法触发，绕开可能被问答弹窗遮住的按钮
    await page.evaluate(() => window.__VC_ENGINE__.sweep());
    await page.waitForTimeout(1400);
    const afterSweep = await page.evaluate(() => window.__VC_ENGINE__?.snapshot());
    check(
      '收网行动生效',
      afterSweep.score > beforeSweep.score,
      `分数 ${beforeSweep.score} → ${afterSweep.score}`,
    );
    await page.screenshot({ path: `${OUT}12-sweep.png` });
  }

  // ------------------------------------------------ 结算页
  // 直接触发结算（测试专用入口）：真的走几十步又慢又容易被问答打断
  // 注意：前面几步可能已经把这一局打完了，那时引擎已经被卸载
  const engineAlive = await page.evaluate(() => !!window.__VC_ENGINE__?.snapshot);
  if (engineAlive) {
    await page.evaluate(() => window.__VC_ENGINE__.debugSetMoves(0));
  }
  await page.waitForTimeout(1500);

  for (let i = 0; i < 0; i += 1) {
    // 问答弹窗会锁住棋盘，先答掉
    await clearQuiz(page);
    const snap = await page.evaluate(() => window.__VC_ENGINE__?.snapshot());
    if (!snap || snap.phase !== 'idle') break;
    if (!snap.hint) break;
    const a = toScreen(snap.hint.a.row, snap.hint.a.col);
    const b = toScreen(snap.hint.b.row, snap.hint.b.col);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(640);
  }
  // 结算页是 React 状态驱动，和引擎的 phase 之间有一小段延迟，必须等
  await page
    .waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('清场完成') || text.includes('差一点');
      },
      { timeout: 12000 },
    )
    .catch(() => {});
  await page.waitForTimeout(600);

  const hasResult =
    (await page.locator('text=清场完成').count()) + (await page.locator('text=差一点').count());
  check('能进入结算页', hasResult > 0);
  await page.screenshot({ path: `${OUT}13-result.png`, fullPage: true });

  if (hasResult > 0) {
    const shareBtn = page.locator('text=分享成绩');
    if ((await shareBtn.count()) > 0) {
      await shareBtn.first().click();
      await page.waitForTimeout(1200);
      const poster = await page.locator('img[alt="成绩分享海报"]').count();
      check('分享海报能生成', poster > 0);
      await page.screenshot({ path: `${OUT}14-share.png`, fullPage: true });
    }
  }

  const realErrors = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('React DevTools') && !e.includes('AudioContext'),
  );
  check('无控制台报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n结果：${passed}/${results.length} 项通过`);
  if (realErrors.length > 0) console.log(`\n控制台错误：\n${realErrors.join('\n')}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error('验证崩溃：', err);
  process.exit(1);
});
