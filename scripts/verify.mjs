/**
 * 端到端验证 —— 用真实浏览器操作游戏
 *
 * 为什么必须做这一步：
 *   单测只能证明「逻辑对」，证明不了「画出来了」和「点了有反应」。
 *   这个脚本会真的加载页面、点棋盘、截图，并检查控制台有没有报错。
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

/** 数一下 canvas 有多少非背景像素，用来判断「画没画东西」 */
async function canvasInk(page, selector) {
  return page.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    if (!canvas) return { ok: false, ink: 0, width: 0, height: 0 };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, ink: 0, width: 0, height: 0 };
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let ink = 0;
    // 统计明显亮于背景的像素
    for (let i = 0; i < data.length; i += 4 * 17) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r + g + b > 120) ink += 1;
    }
    return { ok: true, ink, width, height };
  }, selector);
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

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  // ------------------------------------------------ 首页
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const homeTitle = await page.locator('h1').first().innerText();
  check('首页标题', homeTitle.includes('坏蛋') || homeTitle.includes('消消乐'), homeTitle);

  const avatarInk = await canvasInk(page, 'canvas');
  check('首页立绘已绘制', avatarInk.ok && avatarInk.ink > 200, `ink=${avatarInk.ink}`);
  await page.screenshot({ path: `${OUT}01-home.png`, fullPage: true });

  // ------------------------------------------------ 关卡页
  await page.goto(`${BASE}/levels/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const levelCards = await page.locator('a[href*="/play/"]').count();
  check('关卡列表渲染', levelCards > 0, `${levelCards} 个可点关卡`);
  const villainTiles = await page.locator('canvas').count();
  check('坏人图鉴已绘制', villainTiles >= 5, `${villainTiles} 个 canvas`);
  await page.screenshot({ path: `${OUT}02-levels.png`, fullPage: true });

  // ------------------------------------------------ 捏人页
  await page.goto(`${BASE}/avatar/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const before = await canvasInk(page, 'canvas');
  // 点一个发型
  const hairButton = page.getByRole('button', { name: '鸡冠头' });
  if ((await hairButton.count()) > 0) {
    await hairButton.first().click();
    await page.waitForTimeout(350);
  }
  const after = await canvasInk(page, 'canvas');
  check('捏人预览会随选项变化', before.ink !== after.ink, `ink ${before.ink} → ${after.ink}`);
  const personaText = await page.locator('text=/虚构|卡通/').count();
  check('捏人页有合规说明', personaText > 0);
  await page.screenshot({ path: `${OUT}03-avatar.png`, fullPage: true });

  // ------------------------------------------------ 游戏页
  await page.goto(`${BASE}/play/?level=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const gameCanvas = page.locator('[data-testid="game-board"]');
  const box = await gameCanvas.boundingBox();
  check('棋盘 canvas 存在', Boolean(box), box ? `${Math.round(box.width)}×${Math.round(box.height)}` : '');

  const boardInk = await canvasInk(page, '[data-testid="game-board"]');
  check('棋盘已绘制', boardInk.ink > 500, `ink=${boardInk.ink}`);

  const scoreText = await page.locator('text=得分').first().count();
  check('HUD 显示得分', scoreText > 0);

  await page.screenshot({ path: `${OUT}04-play-start.png` });

  // 真实拖动：在棋盘上找一个方向，模拟一次拖拽
  let moved = false;
  if (box) {
    const cell = box.width / 7;
    // 从中心附近向右拖一格
    const sx = box.x + cell * 0.5 + cell * 2;
    const sy = box.y + cell * 0.5 + cell * 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + cell * 1.2, sy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(900);

    const afterDrag = await canvasInk(page, '[data-testid="game-board"]');
    moved = afterDrag.ink !== boardInk.ink;
    check('拖拽后画面变化', moved, `ink ${boardInk.ink} → ${afterDrag.ink}`);

    const movesLeft = await page
      .locator('text=剩余步数')
      .first()
      .locator('xpath=../p')
      .innerText()
      .catch(() => '');
    check('步数被扣除或有反馈', movesLeft !== '', `剩余步数显示：${movesLeft}`);
    await page.screenshot({ path: `${OUT}05-after-drag.png` });
  }

  // 多点几次，制造消除
  for (let i = 0; i < 8; i += 1) {
    if (!box) break;
    const cell = box.width / 7;
    const col = 1 + (i % 5);
    const row = 1 + ((i * 3) % 5);
    const cx = box.x + cell * (col + 0.5);
    const cy = box.y + cell * (row + 0.5);
    const dir = i % 2 === 0 ? cell : -cell;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dir, cy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(420);
  }
  await page.waitForTimeout(900);

  const finalState = await page.evaluate(() => document.body.innerText.slice(0, 400));
  const stillPlayable = !finalState.includes('清场完成') && !finalState.includes('差一点');
  check('多轮操作后未卡死', stillPlayable, stillPlayable ? '仍在游戏中' : '已进入结算');
  await page.screenshot({ path: `${OUT}06-play-after-many.png` });

  // ------------------------------------------------ 控制台错误
  const realErrors = errors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('Download the React DevTools') &&
      !e.includes('AudioContext was not allowed'),
  );
  check('无控制台报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n结果：${passed}/${results.length} 项通过`);
  if (realErrors.length > 0) {
    console.log(`\n控制台错误：\n${realErrors.join('\n')}`);
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error('验证脚本崩溃：', err);
  process.exit(1);
});
