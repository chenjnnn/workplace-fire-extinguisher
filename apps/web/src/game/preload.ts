/**
 * 程序化美术 —— 所有形象都用 canvas 画出来
 *
 * 为什么不用图片素材：
 *   1. 零资源体积，小程序包大小友好（小游戏首包 4MB 限制）
 *   2. 捏人系统必须用代码画（组合是无限的，不可能预先生成素材）
 *   3. 风格自动统一，改配色只改常量
 */

import type { AvatarConfig, VillainType } from '@vc/core';
import { VILLAINS } from '@vc/core';

// ---------------------------------------------------------------- 基础绘制
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.closePath();
}

const SOFT_COLORS: Record<VillainType, string> = {
  pua: '#dbeafe',
  shirk: '#dcfce7',
  grafter: '#fef3c7',
  overtime: '#fee2e2',
  formalist: '#f3e8ff',
  flatterer: '#fce7f3',
};

/**
 * 道具绘制 —— 每种坏人 3 个变体。
 *
 * 为什么变体只换道具、不换主色和头部轮廓：
 *   三消的可玩性完全建立在「一眼能分辨类型」上。
 *   如果诈骗犯的三种形象颜色不同、轮廓不同，玩家就会认错，
 *   游戏立刻变得不可玩。所以变体只在右下角道具上做文章。
 */
function drawProp(
  ctx: CanvasRenderingContext2D,
  type: VillainType,
  variant: number,
  x: number,
  y: number,
  size: number,
  color: string,
  dark: string,
): void {
  ctx.save();
  ctx.translate(x, y);

  // 深色圆底盘 + 霓虹描边
  circle(ctx, 0, 0, size * 0.7);
  ctx.fillStyle = '#08080e';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.11;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const v = ((variant % 3) + 3) % 3;

  if (type === 'pua') {
    if (v === 0) drawPhone(ctx, size);
    else if (v === 1) drawEnvelope(ctx, size, dark);
    else drawQrCode(ctx, size, dark);
  } else if (type === 'shirk') {
    if (v === 0) drawPill(ctx, size, dark);
    else if (v === 1) drawSyringe(ctx, size, dark);
    else drawPowderBag(ctx, size, dark);
  } else if (type === 'grafter') {
    if (v === 0) drawMoneyBag(ctx, size, dark);
    else if (v === 1) drawGoldBar(ctx, size, dark);
    else drawBottle(ctx, size, dark);
  } else if (type === 'overtime') {
    if (v === 0) drawFist(ctx, size, dark);
    else if (v === 1) drawBat(ctx, size, dark);
    else drawWrench(ctx, size, dark);
  } else {
    if (v === 0) drawUmbrella(ctx, size, dark);
    else if (v === 1) drawShades(ctx, size, dark);
    else drawBriefcase(ctx, size, dark);
  }

  ctx.restore();
}

// ---------------- 道具实现（每个都尽量「剪影可辨」） ----------------
function drawPhone(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.save();
  ctx.rotate(-0.35);
  roundRect(ctx, -s * 0.34, -s * 0.14, s * 0.68, s * 0.28, s * 0.14);
  ctx.fill();
  ctx.fillStyle = '#08080e';
  roundRect(ctx, -s * 0.22, -s * 0.1, s * 0.16, s * 0.2, s * 0.05);
  ctx.fill();
  roundRect(ctx, s * 0.06, -s * 0.1, s * 0.16, s * 0.2, s * 0.05);
  ctx.fill();
  ctx.restore();
}

function drawEnvelope(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  roundRect(ctx, -s * 0.36, -s * 0.26, s * 0.72, s * 0.52, s * 0.06);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  ctx.moveTo(-s * 0.34, -s * 0.22);
  ctx.lineTo(0, s * 0.06);
  ctx.lineTo(s * 0.34, -s * 0.22);
  ctx.stroke();
}

function drawQrCode(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  roundRect(ctx, -s * 0.32, -s * 0.32, s * 0.64, s * 0.64, s * 0.05);
  ctx.fill();
  ctx.fillStyle = dark;
  // 三个定位角 + 中间的点
  for (const [cx, cy] of [
    [-s * 0.19, -s * 0.19],
    [s * 0.19, -s * 0.19],
    [-s * 0.19, s * 0.19],
  ] as Array<[number, number]>) {
    ctx.fillRect(cx - s * 0.06, cy - s * 0.06, s * 0.12, s * 0.12);
    ctx.fillStyle = ctx.fillStyle === dark ? '#0b0b12' : dark;
  }
  ctx.fillStyle = dark;
  ctx.fillRect(-s * 0.03, -s * 0.03, s * 0.06, s * 0.06);
}

function drawPill(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  ctx.save();
  ctx.rotate(-0.6);
  roundRect(ctx, -s * 0.4, -s * 0.18, s * 0.8, s * 0.36, s * 0.18);
  ctx.fill();
  ctx.fillStyle = dark;
  roundRect(ctx, 0, -s * 0.18, s * 0.4, s * 0.36, s * 0.18);
  ctx.fill();
  ctx.restore();
}

function drawSyringe(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  ctx.save();
  ctx.rotate(-0.7);
  // 针筒
  roundRect(ctx, -s * 0.3, -s * 0.14, s * 0.52, s * 0.28, s * 0.05);
  ctx.fill();
  // 药液
  ctx.fillStyle = dark;
  roundRect(ctx, -s * 0.24, -s * 0.1, s * 0.24, s * 0.2, s * 0.03);
  ctx.fill();
  // 针头
  ctx.fillStyle = ctx.fillStyle === dark ? dark : dark;
  ctx.beginPath();
  ctx.moveTo(s * 0.22, 0);
  ctx.lineTo(s * 0.44, 0);
  ctx.lineTo(s * 0.22, s * 0.05);
  ctx.closePath();
  ctx.fill();
  // 推杆
  ctx.fillRect(-s * 0.42, -s * 0.05, s * 0.12, s * 0.1);
  ctx.restore();
}

function drawPowderBag(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  // 自封袋
  roundRect(ctx, -s * 0.32, -s * 0.24, s * 0.64, s * 0.48, s * 0.06);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.16);
  ctx.lineTo(s * 0.3, -s * 0.16);
  ctx.stroke();
  // 封口
  ctx.fillStyle = dark;
  ctx.fillRect(-s * 0.18, -s * 0.28, s * 0.36, s * 0.08);
}

function drawMoneyBag(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  ctx.beginPath();
  ctx.moveTo(-s * 0.32, -s * 0.14);
  ctx.quadraticCurveTo(-s * 0.42, s * 0.36, 0, s * 0.36);
  ctx.quadraticCurveTo(s * 0.42, s * 0.36, s * 0.32, -s * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.fillRect(-s * 0.14, -s * 0.26, s * 0.28, s * 0.12);
  ctx.font = `bold ${s * 0.34}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('¥', 0, s * 0.1);
}

function drawGoldBar(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  // 梯形金条
  ctx.beginPath();
  ctx.moveTo(-s * 0.36, s * 0.16);
  ctx.lineTo(-s * 0.24, -s * 0.16);
  ctx.lineTo(s * 0.24, -s * 0.16);
  ctx.lineTo(s * 0.36, s * 0.16);
  ctx.closePath();
  ctx.fill();
  // 高光
  ctx.fillStyle = dark;
  ctx.fillRect(-s * 0.2, -s * 0.1, s * 0.4, s * 0.08);
}

function drawBottle(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  // 瓶身
  roundRect(ctx, -s * 0.2, -s * 0.1, s * 0.4, s * 0.44, s * 0.06);
  ctx.fill();
  // 瓶颈
  ctx.fillRect(-s * 0.08, -s * 0.28, s * 0.16, s * 0.2);
  // 瓶盖
  ctx.fillStyle = dark;
  ctx.fillRect(-s * 0.1, -s * 0.36, s * 0.2, s * 0.1);
  // 标签
  ctx.fillStyle = dark;
  ctx.fillRect(-s * 0.16, s * 0.04, s * 0.32, s * 0.12);
}

function drawFist(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  roundRect(ctx, -s * 0.3, -s * 0.24, s * 0.6, s * 0.48, s * 0.14);
  ctx.fill();
  ctx.fillStyle = dark;
  for (let i = 0; i < 3; i += 1) {
    circle(ctx, -s * 0.16 + i * s * 0.16, -s * 0.14, s * 0.042);
    ctx.fill();
  }
  ctx.strokeStyle = dark;
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, s * 0.04);
  ctx.lineTo(-s * 0.02, s * 0.16);
  ctx.moveTo(s * 0.06, s * 0.02);
  ctx.lineTo(s * 0.02, s * 0.14);
  ctx.stroke();
}

function drawBat(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  ctx.save();
  ctx.rotate(-0.6);
  // 棒身
  roundRect(ctx, -s * 0.06, -s * 0.38, s * 0.12, s * 0.52, s * 0.04);
  ctx.fill();
  // 握把
  ctx.fillStyle = dark;
  roundRect(ctx, -s * 0.08, s * 0.08, s * 0.16, s * 0.28, s * 0.05);
  ctx.fill();
  ctx.restore();
}

function drawWrench(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  ctx.save();
  ctx.rotate(-0.7);
  roundRect(ctx, -s * 0.06, -s * 0.18, s * 0.12, s * 0.52, s * 0.04);
  ctx.fill();
  // 开口
  ctx.beginPath();
  ctx.arc(0, -s * 0.24, s * 0.18, Math.PI * 1.15, Math.PI * 1.85);
  ctx.lineTo(-s * 0.06, -s * 0.2);
  ctx.lineTo(s * 0.06, -s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  circle(ctx, 0, -s * 0.24, s * 0.08);
  ctx.fill();
  ctx.restore();
}

function drawUmbrella(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  ctx.beginPath();
  ctx.arc(0, s * 0.04, s * 0.36, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.04);
  ctx.lineTo(-s * 0.18, s * 0.04);
  ctx.moveTo(0, s * 0.04);
  ctx.lineTo(s * 0.18, s * 0.04);
  ctx.stroke();
  ctx.strokeStyle = ctx.strokeStyle === dark ? dark : dark;
  ctx.lineWidth = s * 0.09;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.04);
  ctx.lineTo(0, s * 0.36);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-s * 0.08, s * 0.36, s * 0.09, 0, Math.PI);
  ctx.stroke();
}

function drawShades(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  // 墨镜：两片 + 镜桥
  roundRect(ctx, -s * 0.34, -s * 0.12, s * 0.26, s * 0.2, s * 0.06);
  ctx.fill();
  roundRect(ctx, s * 0.08, -s * 0.12, s * 0.26, s * 0.2, s * 0.06);
  ctx.fill();
  ctx.fillRect(-s * 0.08, -s * 0.04, s * 0.16, s * 0.06);
  // 镜腿
  ctx.strokeStyle = ctx.fillStyle === dark ? dark : dark;
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.moveTo(-s * 0.34, -s * 0.02);
  ctx.lineTo(-s * 0.44, s * 0.06);
  ctx.moveTo(s * 0.34, -s * 0.02);
  ctx.lineTo(s * 0.44, s * 0.06);
  ctx.stroke();
}

function drawBriefcase(ctx: CanvasRenderingContext2D, s: number, dark: string): void {
  roundRect(ctx, -s * 0.36, -s * 0.2, s * 0.72, s * 0.44, s * 0.06);
  ctx.fill();
  // 提手
  ctx.strokeStyle = ctx.fillStyle === dark ? dark : dark;
  ctx.lineWidth = s * 0.08;
  ctx.beginPath();
  ctx.arc(0, -s * 0.2, s * 0.14, Math.PI, 0);
  ctx.stroke();
  // 锁扣
  ctx.fillStyle = dark;
  ctx.fillRect(-s * 0.05, -s * 0.06, s * 0.1, s * 0.16);
}

// ---------------------------------------------------------------- 整块牌面
export interface TileSpriteOptions {
  type: VillainType;
  /** 像素尺寸（正方形边长） */
  size: number;
  /** 是否被毒雾污染 */
  poisoned?: boolean;
  /** 剩余血量（贪官 2 血时要显示裂痕） */
  hp?: number;
  /** 视觉变体编号（0/1/2） */
  variant?: number;
  /** 是否用用户捏的形象替换诈骗犯（在结算/主页展示用） */
  avatarOverride?: AvatarConfig | null;
}

/**
 * 画一张完整的牌：圆角卡底 + 霓虹描边 + 头像 + 状态标记
 */
/**
 * 棋子绘制 —— 「一张脸」而不是「一个球」
 *
 * 为什么这样改：
 *   上一版是彩色球 + 小眼睛，看起来像糖果，5 种类型只能靠颜色区分，很土。
 *   这一版让**脸占满整个棋子**，靠「发型 + 五官 + 表情 + 配饰」四重区分，
 *   即使黑白打印也能认出是哪个领导。
 *
 * 每张脸的元素都是漫画式夸张的：大眼睛、大嘴、夸张发型。
 */
export function drawTileSprite(
  ctx: CanvasRenderingContext2D,
  options: TileSpriteOptions,
): void {
  const { type, size, poisoned = false, hp = 1 } = options;

  ctx.save();

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.47;

  // ---- 纯色圆底 + 很轻的投影（参考图那种扁平卡片感，不做渐变）
  ctx.save();
  ctx.shadowColor = 'rgba(60, 50, 40, 0.14)';
  ctx.shadowBlur = size * 0.07;
  ctx.shadowOffsetY = size * 0.025;
  circle(ctx, cx, cy, r);
  ctx.fillStyle = FLAT_BG[type];
  ctx.fill();
  ctx.restore();

  // ---- 裁到圆里画内容
  ctx.save();
  circle(ctx, cx, cy, r);
  ctx.clip();
  drawFlatBoss(ctx, type, cx, cy, r);
  ctx.restore();

  // ---- 受伤标记
  if (hp <= 1 && type === 'grafter') {
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = size * 0.03;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.42, cy - r * 0.8);
    ctx.lineTo(cx + r * 0.56, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.44, cy - r * 0.26);
    ctx.stroke();
  }

  // ---- 毒雾（甩锅侠甩出的锅）
  if (poisoned) {
    ctx.save();
    circle(ctx, cx, cy, r);
    ctx.clip();
    ctx.fillStyle = 'rgba(101, 163, 13, 0.4)';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(63, 98, 18, 0.6)';
    circle(ctx, cx, cy + r * 0.15, r * 0.4);
    ctx.fill();
    ctx.fillRect(cx - r * 0.5, cy - r * 0.35, r * 0.22, r * 0.1);
    ctx.restore();
  }

  ctx.restore();
}

/** 参考图那种低饱和纯色底 */
/**
 * 棋盘底色 —— 严格限定为六种：红 / 紫 / 蓝 / 黄 / 绿 / 浅粉。
 * 不再使用其他颜色，避免玩家在小尺寸下把两种颜色看混。
 */
const FLAT_BG: Record<VillainType, string> = {
  overtime: '#ef4444', // 红
  formalist: '#a855f7', // 紫
  pua: '#3b82f6', // 蓝
  grafter: '#fbbf24', // 黄
  shirk: '#22c55e', // 绿
  flatterer: '#f9a8d4', // 浅粉
};

/** 西装颜色（比底色更深一档，形成层次） */
const FLAT_SUIT: Record<VillainType, string> = {
  pua: '#1e3a8a',
  shirk: '#166534',
  grafter: '#92400e',
  overtime: '#7f1d1d',
  formalist: '#581c87',
  flatterer: '#9d174d',
};

/**
 * 扁平风领导头像 —— 对照参考图重画
 *
 * 风格约束（这是「不土」的关键）：
 *   · 纯色块，不用渐变、不用高光、不用霓虹描边
 *   · 五官用粗黑线条，极简
 *   · 一张脸最多 6 个元素：头发、眼、眉、嘴、配饰、西装领
 */
function drawFlatBoss(
  ctx: CanvasRenderingContext2D,
  type: VillainType,
  cx: number,
  cy: number,
  r: number,
): void {
  const skin = '#f3d3b3';
  const skinDark = '#e0b88f';
  const ink = '#2b2118';

  // ---- 西装肩膀
  const shoulderY = cy + r * 0.56;
  ctx.fillStyle = FLAT_SUIT[type];
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.1, cy + r * 1.1);
  ctx.quadraticCurveTo(cx - r * 1.0, shoulderY, cx - r * 0.34, shoulderY + r * 0.04);
  ctx.lineTo(cx + r * 0.34, shoulderY + r * 0.04);
  ctx.quadraticCurveTo(cx + r * 1.0, shoulderY, cx + r * 1.1, cy + r * 1.1);
  ctx.closePath();
  ctx.fill();

  // ---- 白衬衫 V 领
  ctx.fillStyle = '#fbfbf7';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.26, shoulderY + r * 0.02);
  ctx.lineTo(cx, shoulderY + r * 0.46);
  ctx.lineTo(cx + r * 0.26, shoulderY + r * 0.02);
  ctx.closePath();
  ctx.fill();

  // ---- 领带
  ctx.fillStyle = FLAT_TIE[type];
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.075, shoulderY + r * 0.1);
  ctx.lineTo(cx + r * 0.075, shoulderY + r * 0.1);
  ctx.lineTo(cx + r * 0.1, shoulderY + r * 0.42);
  ctx.lineTo(cx, shoulderY + r * 0.55);
  ctx.lineTo(cx - r * 0.1, shoulderY + r * 0.42);
  ctx.closePath();
  ctx.fill();

  // ---- 脸（略方的圆，参考图的脸型）
  const faceR = r * 0.72;
  const faceY = cy + r * 0.0;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, faceY, faceR * 0.88, faceR, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- 耳朵
  ctx.fillStyle = skinDark;
  circle(ctx, cx - faceR * 0.9, faceY + faceR * 0.08, faceR * 0.13);
  ctx.fill();
  circle(ctx, cx + faceR * 0.9, faceY + faceR * 0.08, faceR * 0.13);
  ctx.fill();

  // ---- 发型（5 种完全不同的轮廓）
  drawFlatHair(ctx, type, cx, faceY, faceR);

  // ---- 五官
  const eyeY = faceY - faceR * 0.06;
  const gap = faceR * 0.4;

  if (type === 'pua') {
    // 傲慢：金丝圆框眼镜 + 平嘴（和大墨镜的抢功精区分开）
    // 镜框
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = faceR * 0.055;
    circle(ctx, cx - gap, eyeY, faceR * 0.2);
    ctx.stroke();
    circle(ctx, cx + gap, eyeY, faceR * 0.2);
    ctx.stroke();
    // 镜架
    ctx.beginPath();
    ctx.moveTo(cx - gap + faceR * 0.2, eyeY);
    ctx.lineTo(cx + gap - faceR * 0.2, eyeY);
    ctx.stroke();
    // 镜片里的眼睛（小冷眼）
    ctx.fillStyle = '#2b2118';
    circle(ctx, cx - gap, eyeY + faceR * 0.02, faceR * 0.065);
    ctx.fill();
    circle(ctx, cx + gap, eyeY + faceR * 0.02, faceR * 0.065);
    ctx.fill();
    // 镜片反光
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    circle(ctx, cx - gap - faceR * 0.07, eyeY - faceR * 0.07, faceR * 0.045);
    ctx.fill();
    circle(ctx, cx + gap - faceR * 0.07, eyeY - faceR * 0.07, faceR * 0.045);
    ctx.fill();

    // 平嘴（不屑）
    ctx.strokeStyle = ink;
    ctx.lineWidth = faceR * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - faceR * 0.22, faceY + faceR * 0.5);
    ctx.lineTo(cx + faceR * 0.22, faceY + faceR * 0.5);
    ctx.stroke();
  } else if (type === 'shirk') {
    /**
     * 甩锅侠 = 绿 + 背着一口锅 + 困倦眼
     *
     * 为什么改：之前他和「形式怪」都是圆脸 + 深色头发 + 微笑，
     * 缩到 40px 在棋盘上几乎分不出来。现在给他一个一眼可辨的符号 —— 那口锅。
     */

    // 困倦眼：上眼皮压下来
    ctx.strokeStyle = ink;
    ctx.lineWidth = faceR * 0.08;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * gap - faceR * 0.2, eyeY - faceR * 0.02);
      ctx.quadraticCurveTo(
        cx + side * gap,
        eyeY - faceR * 0.16,
        cx + side * gap + faceR * 0.2,
        eyeY - faceR * 0.02,
      );
      ctx.stroke();
    }
    // 半睁的眼珠
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(cx - gap, eyeY + faceR * 0.1, faceR * 0.085, faceR * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + gap, eyeY + faceR * 0.1, faceR * 0.085, faceR * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // 困倦的嘴：一条向下弯的短弧（不满，但懒得说）
    ctx.strokeStyle = ink;
    ctx.lineWidth = faceR * 0.07;
    ctx.beginPath();
    ctx.arc(cx, faceY + faceR * 0.66, faceR * 0.16, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();

    // ---- 睡眠气泡（Zzz）：识别点是「困」
    // 画在头顶偏左，避开右下角的道具徽章
    const zx = cx - faceR * 0.38;
    const zy = faceY - faceR * 0.58;
    ctx.lineJoin = 'round';
    const zSizes = [faceR * 0.48, faceR * 0.36, faceR * 0.26];
    const zOffsets = [
      [0, 0],
      [-faceR * 0.42, -faceR * 0.4],
      [-faceR * 0.74, -faceR * 0.74],
    ];
    for (let i = 0; i < 3; i += 1) {
      const size = zSizes[i]!;
      const off = zOffsets[i]!;
      const bx = zx + off[0]!;
      const by = zy + off[1]!;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3a3a42';
      ctx.lineWidth = faceR * 0.07;
      ctx.beginPath();
      ctx.moveTo(bx - size * 0.5, by - size * 0.5);
      ctx.lineTo(bx + size * 0.5, by - size * 0.5);
      ctx.lineTo(bx - size * 0.5, by + size * 0.5);
      ctx.lineTo(bx + size * 0.5, by + size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

  } else if (type === 'grafter') {
    /**
     * 抢功精 = 金 + 光头 + 大墨镜 + 得意大笑
     *
     * 为什么改成光头：用户两次反馈他和「甩锅侠」分不清。
     * 根因是我一直靠「头顶加符号」区分 ——
     * 结果两个都是「圆脸 + 深色刘海 + 头顶符号」，反而更像。
     * 解法是从剪影层面分开：他光头（圆），另一个留乱发（锯齿）。
     */

    // 光头高光
    ctx.fillStyle = 'rgba(255, 246, 225, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx - faceR * 0.1, faceY - faceR * 0.52, faceR * 0.32, faceR * 0.18, -0.28, 0, Math.PI * 2);
    ctx.fill();

    // 大墨镜：一整条横贯脸的黑块（这是最强的剪影特征）
    ctx.fillStyle = '#1b1b22';
    roundRect(ctx, cx - faceR * 0.64, eyeY - faceR * 0.24, faceR * 1.28, faceR * 0.44, faceR * 0.12);
    ctx.fill();
    // 镜片反光
    ctx.fillStyle = 'rgba(150, 215, 255, 0.42)';
    ctx.beginPath();
    ctx.moveTo(cx - faceR * 0.5, eyeY - faceR * 0.22);
    ctx.lineTo(cx - faceR * 0.16, eyeY - faceR * 0.22);
    ctx.lineTo(cx - faceR * 0.4, eyeY + faceR * 0.18);
    ctx.lineTo(cx - faceR * 0.56, eyeY + faceR * 0.18);
    ctx.closePath();
    ctx.fill();

    // 得意的张嘴大笑
    ctx.fillStyle = '#7a2f2f';
    ctx.beginPath();
    ctx.ellipse(cx, faceY + faceR * 0.52, faceR * 0.3, faceR * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbfbf7';
    roundRect(ctx, cx - faceR * 0.27, faceY + faceR * 0.35, faceR * 0.54, faceR * 0.1, faceR * 0.03);
    ctx.fill();
    roundRect(ctx, cx - faceR * 0.24, faceY + faceR * 0.6, faceR * 0.48, faceR * 0.08, faceR * 0.03);
    ctx.fill();

    // 头顶金币
    const coinY = faceY - faceR * 0.88;
    const coinR = faceR * 0.24;
    circle(ctx, cx, coinY, coinR);
    ctx.fillStyle = '#f2c14e';
    ctx.fill();
    ctx.strokeStyle = '#c9971f';
    ctx.lineWidth = faceR * 0.045;
    ctx.stroke();
    ctx.fillStyle = '#8a6410';
    ctx.font = `bold ${faceR * 0.26}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¥', cx, coinY + faceR * 0.01);

  } else if (type === 'overtime') {
    // 暴躁：怒眉 + 龇牙 + 头顶青筋
    drawDotEyes(ctx, cx, eyeY, gap, faceR, ink);
    ctx.strokeStyle = ink;
    ctx.lineWidth = faceR * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - gap * 1.55, eyeY - faceR * 0.46);
    ctx.lineTo(cx - gap * 0.5, eyeY - faceR * 0.24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + gap * 1.55, eyeY - faceR * 0.46);
    ctx.lineTo(cx + gap * 0.5, eyeY - faceR * 0.24);
    ctx.stroke();

    // 龇牙（白色方块 + 黑缝）
    ctx.fillStyle = '#fbfbf7';
    roundRect(ctx, cx - faceR * 0.26, faceY + faceR * 0.38, faceR * 0.52, faceR * 0.22, faceR * 0.05);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = faceR * 0.035;
    ctx.beginPath();
    ctx.moveTo(cx - faceR * 0.09, faceY + faceR * 0.38);
    ctx.lineTo(cx - faceR * 0.09, faceY + faceR * 0.6);
    ctx.moveTo(cx + faceR * 0.09, faceY + faceR * 0.38);
    ctx.lineTo(cx + faceR * 0.09, faceY + faceR * 0.6);
    ctx.stroke();

    // 头顶青筋（参考图红色的那个爆炸符号）
    ctx.strokeStyle = '#5c1208';
    ctx.lineWidth = faceR * 0.14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + faceR * 0.58, faceY - faceR * 0.78);
    ctx.lineTo(cx + faceR * 0.92, faceY - faceR * 0.96);
    ctx.moveTo(cx + faceR * 0.68, faceY - faceR * 0.58);
    ctx.lineTo(cx + faceR * 1.02, faceY - faceR * 0.56);
    ctx.stroke();
  } else {
    /**
     * 形式怪 = 紫 + 假笑面具
     *
     * 用户的原话：「虚伪领导 → 假笑面具 + 紫色领带，识别点是面具」。
     *
     * 画法：上半张脸盖一张面具 —— 面具上有弯弯的笑眼和一个小圆嘴，
     * 但面具下面露出的真实嘴巴是一条平线。一眼看到「两张嘴」就知道是假的。
     */
    // 真实的眼睛（在面具下沿露出来，小而冷）
    ctx.fillStyle = '#3a3a42';
    ctx.beginPath();
    ctx.ellipse(cx - gap, faceY + faceR * 0.02, faceR * 0.075, faceR * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + gap, faceY + faceR * 0.02, faceR * 0.075, faceR * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // 真实的嘴：一条平线（冷漠）
    ctx.strokeStyle = ink;
    ctx.lineWidth = faceR * 0.06;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - faceR * 0.2, faceY + faceR * 0.52);
    ctx.lineTo(cx + faceR * 0.2, faceY + faceR * 0.52);
    ctx.stroke();

    // ---- 面具（盖住上半张脸）
    const maskTop = faceY - faceR * 0.62;
    const maskW = faceR * 0.78;
    const maskH = faceR * 0.62;
    ctx.fillStyle = '#f7f3e8';
    ctx.beginPath();
    ctx.ellipse(cx, maskTop + maskH * 0.5, maskW, maskH * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // 面具的边（一条细线，让面具和脸分开）
    ctx.strokeStyle = '#d8cdb8';
    ctx.lineWidth = faceR * 0.035;
    ctx.stroke();

    // 面具上的笑眼（两个下弯的弧形）
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = faceR * 0.075;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx - gap, maskTop + maskH * 0.46, faceR * 0.16, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + gap, maskTop + maskH * 0.46, faceR * 0.16, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // 面具上的小圆嘴（假笑）
    ctx.strokeStyle = '#8a7a5a';
    ctx.beginPath();
    ctx.arc(cx, maskTop + maskH * 0.82, faceR * 0.14, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    // 面具的系带（绕过脸的两侧）
    ctx.strokeStyle = '#d8cdb8';
    ctx.lineWidth = faceR * 0.04;
    ctx.beginPath();
    ctx.moveTo(cx - maskW, maskTop + maskH * 0.55);
    ctx.lineTo(cx - faceR * 0.9, maskTop + maskH * 0.62);
    ctx.moveTo(cx + maskW, maskTop + maskH * 0.55);
    ctx.lineTo(cx + faceR * 0.9, maskTop + maskH * 0.62);
    ctx.stroke();
  }
}

const FLAT_TIE: Record<VillainType, string> = {
  pua: '#1d4ed8',
  shirk: '#15803d',
  grafter: '#b45309',
  overtime: '#991b1b',
  formalist: '#7e22ce',
  flatterer: '#be185d',
};

/** 极简黑点眼 */
function drawDotEyes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  eyeY: number,
  gap: number,
  faceR: number,
  ink: string,
): void {
  ctx.fillStyle = ink;
  circle(ctx, cx - gap, eyeY, faceR * 0.1);
  ctx.fill();
  circle(ctx, cx + gap, eyeY, faceR * 0.1);
  ctx.fill();
}

/** 五种完全不同的发型轮廓 */
function drawFlatHair(
  ctx: CanvasRenderingContext2D,
  type: VillainType,
  cx: number,
  faceY: number,
  faceR: number,
): void {
  if (type === 'pua') {
    // 油腻大背头：整块 + 一道高光
    ctx.fillStyle = '#1b1b22';
    ctx.beginPath();
    ctx.moveTo(cx - faceR * 0.9, faceY - faceR * 0.28);
    ctx.quadraticCurveTo(cx - faceR * 0.86, faceY - faceR * 1.02, cx + faceR * 0.1, faceY - faceR * 0.98);
    ctx.quadraticCurveTo(cx + faceR * 0.92, faceY - faceR * 0.94, cx + faceR * 0.9, faceY - faceR * 0.24);
    ctx.quadraticCurveTo(cx + faceR * 0.3, faceY - faceR * 0.62, cx - faceR * 0.9, faceY - faceR * 0.28);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx - faceR * 0.12, faceY - faceR * 0.78, faceR * 0.34, faceR * 0.09, -0.12, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'shirk') {
    // 短刘海（偏分）
    ctx.fillStyle = '#3a2a1c';
    ctx.beginPath();
    ctx.moveTo(cx - faceR * 0.92, faceY - faceR * 0.3);
    ctx.quadraticCurveTo(cx - faceR * 0.9, faceY - faceR * 1.04, cx, faceY - faceR * 1.0);
    ctx.quadraticCurveTo(cx + faceR * 0.9, faceY - faceR * 0.98, cx + faceR * 0.92, faceY - faceR * 0.3);
    ctx.quadraticCurveTo(cx + faceR * 0.4, faceY - faceR * 0.56, cx + faceR * 0.06, faceY - faceR * 0.5);
    ctx.quadraticCurveTo(cx - faceR * 0.3, faceY - faceR * 0.44, cx - faceR * 0.92, faceY - faceR * 0.3);
    ctx.fill();
  } else if (type === 'grafter') {
    // 光头：只留头顶一小圈发际线阴影，整体是圆的
    ctx.fillStyle = '#c9b89a';
    ctx.beginPath();
    ctx.arc(cx, faceY - faceR * 0.1, faceR * 0.93, Math.PI * 1.18, Math.PI * 1.82);
    ctx.closePath();
    ctx.fill();

  } else if (type === 'overtime') {
    // 稀发（快秃了，只剩几根）
    ctx.strokeStyle = '#3a2a1c';
    ctx.lineWidth = faceR * 0.055;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i += 1) {
      const x = cx - faceR * 0.5 + i * faceR * 0.25;
      ctx.beginPath();
      ctx.moveTo(x, faceY - faceR * 0.86);
      ctx.quadraticCurveTo(x + faceR * 0.06, faceY - faceR * 1.05, x + faceR * 0.16, faceY - faceR * 1.08);
      ctx.stroke();
    }
    // 头顶反光
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx - faceR * 0.08, faceY - faceR * 0.84, faceR * 0.2, faceR * 0.07, -0.25, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 中分（参考图紫色那个）
    ctx.fillStyle = '#2f2a3a';
    ctx.beginPath();
    ctx.arc(cx, faceY - faceR * 0.14, faceR * 0.94, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fill();
    // 中缝
    ctx.fillStyle = FLAT_BG.formalist;
    ctx.beginPath();
    ctx.moveTo(cx - faceR * 0.05, faceY - faceR * 0.94);
    ctx.lineTo(cx + faceR * 0.05, faceY - faceR * 0.94);
    ctx.lineTo(cx + faceR * 0.025, faceY - faceR * 0.5);
    ctx.lineTo(cx - faceR * 0.025, faceY - faceR * 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------------------------------------------------------------- 捏的人
const HAIR_COLOR_DARK: Record<string, string> = {};

function darken(hex: string, amount = 0.65): string {
  const cached = HAIR_COLOR_DARK[hex];
  if (cached) return cached;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = Math.floor(parseInt(clean.slice(0, 2), 16) * amount);
  const g = Math.floor(parseInt(clean.slice(2, 4), 16) * amount);
  const b = Math.floor(parseInt(clean.slice(4, 6), 16) * amount);
  const out = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  HAIR_COLOR_DARK[hex] = out;
  return out;
}

/**
 * 画用户捏的「虚构领导」。
 *
 * 所有特征都是固定枚举组合出来的，没有任何写实照片元素。
 * 这个函数会被用在：主页立绘、捏人预览、结算展示。
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  avatar: AvatarConfig,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(x, y);

  const s = size;
  const headR = s * 0.23;
  const headCx = 0;
  const headCy = -s * 0.06;

  // ---- 身体（西装 / 衬衫 / 制服 / 长袍）
  ctx.save();
  const shoulderY = headCy + headR * 1.1;
  ctx.fillStyle = avatar.outfitColor;
  if (avatar.outfit === 'suit' || avatar.outfit === 'office_casual') {
    // 肩膀梯形
    ctx.beginPath();
    ctx.moveTo(-s * 0.36, s * 0.46);
    ctx.quadraticCurveTo(-s * 0.34, shoulderY + s * 0.1, -s * 0.16, shoulderY);
    ctx.lineTo(s * 0.16, shoulderY);
    ctx.quadraticCurveTo(s * 0.34, shoulderY + s * 0.1, s * 0.36, s * 0.46);
    ctx.closePath();
    ctx.fill();

    if (avatar.outfit === 'suit') {
      // 衬衫 V 领
      ctx.fillStyle = '#f4f4f8';
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, shoulderY);
      ctx.lineTo(0, s * 0.3);
      ctx.lineTo(s * 0.1, shoulderY);
      ctx.closePath();
      ctx.fill();
      // 领带
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo(-s * 0.035, s * 0.12);
      ctx.lineTo(s * 0.035, s * 0.12);
      ctx.lineTo(s * 0.05, s * 0.34);
      ctx.lineTo(0, s * 0.42);
      ctx.lineTo(-s * 0.05, s * 0.34);
      ctx.closePath();
      ctx.fill();
    } else {
      // 衬衫：敞两颗扣子
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.08, shoulderY);
      ctx.lineTo(0, s * 0.2);
      ctx.lineTo(s * 0.08, shoulderY);
      ctx.closePath();
      ctx.fill();
    }
  } else if (avatar.outfit === 'uniform') {
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, s * 0.46);
    ctx.quadraticCurveTo(-s * 0.32, shoulderY + s * 0.1, -s * 0.16, shoulderY);
    ctx.lineTo(s * 0.16, shoulderY);
    ctx.quadraticCurveTo(s * 0.32, shoulderY + s * 0.1, s * 0.34, s * 0.46);
    ctx.closePath();
    ctx.fill();
    // 肩章
    ctx.fillStyle = '#e8c94a';
    ctx.fillRect(-s * 0.3, shoulderY + s * 0.04, s * 0.12, s * 0.035);
    ctx.fillRect(s * 0.18, shoulderY + s * 0.04, s * 0.12, s * 0.035);
  } else {
    // robe：下摆更宽
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, s * 0.46);
    ctx.quadraticCurveTo(-s * 0.3, shoulderY + s * 0.1, -s * 0.16, shoulderY);
    ctx.lineTo(s * 0.16, shoulderY);
    ctx.quadraticCurveTo(s * 0.3, shoulderY + s * 0.1, s * 0.4, s * 0.46);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // ---- 脖子
  ctx.fillStyle = darken(avatar.skin, 0.9);
  ctx.fillRect(-s * 0.05, headCy + headR * 0.7, s * 0.1, s * 0.09);

  // ---- 头（脸型）
  ctx.fillStyle = avatar.skin;
  const faceW = avatar.face === 'round' ? 0.25 : avatar.face === 'long' ? 0.2 : avatar.face === 'sharp' ? 0.21 : 0.235;
  const faceH = avatar.face === 'long' ? 0.27 : avatar.face === 'round' ? 0.235 : 0.25;

  if (avatar.face === 'sharp') {
    ctx.beginPath();
    ctx.moveTo(headCx - s * faceW, headCy - s * 0.06);
    ctx.quadraticCurveTo(headCx, headCy - s * faceH, headCx + s * faceW, headCy - s * 0.06);
    ctx.lineTo(headCx + s * 0.06, headCy + s * faceH * 0.85);
    ctx.lineTo(headCx, headCy + s * faceH);
    ctx.lineTo(headCx - s * 0.06, headCy + s * faceH * 0.85);
    ctx.closePath();
    ctx.fill();
  } else {
    ellipse(ctx, headCx, headCy, s * faceW, s * faceH);
    ctx.fill();
  }

  // ---- 头发
  ctx.fillStyle = avatar.hairColor;
  switch (avatar.hair) {
    case 'slick':
      // 大背头：油亮发际线 + 高顶
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, headCy - s * 0.06);
      ctx.quadraticCurveTo(-s * 0.2, headCy - s * 0.32, s * 0.04, headCy - s * 0.29);
      ctx.quadraticCurveTo(s * 0.24, headCy - s * 0.27, s * 0.235, headCy - s * 0.08);
      ctx.quadraticCurveTo(s * 0.1, headCy - s * 0.16, -s * 0.24, headCy - s * 0.06);
      ctx.fill();
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.ellipse(-s * 0.05, headCy - s * 0.2, s * 0.1, s * 0.03, -0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'short':
      ctx.beginPath();
      ctx.arc(headCx, headCy - s * 0.03, s * 0.245, Math.PI * 1.05, Math.PI * 1.95);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bowl':
      ctx.beginPath();
      ctx.arc(headCx, headCy - s * 0.02, s * 0.25, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      // 齐刘海
      ctx.fillRect(-s * 0.24, headCy - s * 0.06, s * 0.48, s * 0.08);
      break;
    case 'mohawk':
      ctx.beginPath();
      ctx.moveTo(-s * 0.04, headCy - s * 0.2);
      ctx.quadraticCurveTo(0, headCy - s * 0.46, s * 0.04, headCy - s * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bun':
      ctx.beginPath();
      ctx.arc(headCx, headCy - s * 0.02, s * 0.245, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      // 丸子
      circle(ctx, headCx, headCy - s * 0.3, s * 0.085);
      ctx.fill();
      break;
    case 'long':
      ctx.beginPath();
      ctx.arc(headCx, headCy - s * 0.02, s * 0.25, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      // 两侧长发
      ctx.fillRect(-s * 0.25, headCy - s * 0.05, s * 0.07, s * 0.42);
      ctx.fillRect(s * 0.18, headCy - s * 0.05, s * 0.07, s * 0.42);
      break;
    case 'bald':
      // 秃顶：两侧留一圈
      ctx.beginPath();
      ctx.arc(headCx, headCy - s * 0.04, s * 0.245, Math.PI * 1.12, Math.PI * 1.88);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-s * 0.245, headCy - s * 0.1, s * 0.06, s * 0.14);
      ctx.fillRect(s * 0.185, headCy - s * 0.1, s * 0.06, s * 0.14);
      // 反光
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.ellipse(-s * 0.06, headCy - s * 0.16, s * 0.07, s * 0.025, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
  }

  // ---- 眉毛
  ctx.strokeStyle = avatar.hair === 'bald' ? '#3a3a46' : darken(avatar.hairColor, 0.8);
  ctx.lineWidth = s * 0.022;
  ctx.lineCap = 'round';
  const browY = headCy - s * 0.035;
  const browGap = s * 0.095;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    if (avatar.brow === 'angry') {
      ctx.moveTo(headCx + side * browGap * 1.3, browY - s * 0.02);
      ctx.lineTo(headCx + side * browGap * 0.4, browY + s * 0.022);
    } else if (avatar.brow === 'arched') {
      ctx.moveTo(headCx + side * browGap * 1.25, browY + s * 0.005);
      ctx.quadraticCurveTo(headCx + side * browGap * 0.85, browY - s * 0.03, headCx + side * browGap * 0.45, browY);
    } else if (avatar.brow === 'thick') {
      ctx.lineWidth = s * 0.034;
      ctx.moveTo(headCx + side * browGap * 1.3, browY);
      ctx.lineTo(headCx + side * browGap * 0.4, browY);
      ctx.lineWidth = s * 0.022;
    } else {
      ctx.moveTo(headCx + side * browGap * 1.3, browY + s * 0.01);
      ctx.lineTo(headCx + side * browGap * 0.45, browY + s * 0.01);
    }
    ctx.stroke();
  }

  // ---- 眼睛（按表情变化）
  const eyeY = headCy + s * 0.02;
  const eyeGap = s * 0.1;
  ctx.fillStyle = '#1a1a22';
  if (avatar.accessory === 'sunglasses') {
    // 墨镜：两片镜片 + 细镜桥。
    // 注意别做成一整条宽横条 —— 那会把头发全遮住，用户捏的发型就白捏了。
    ctx.fillStyle = '#0c0c12';
    roundRect(ctx, headCx - s * 0.185, eyeY - s * 0.038, s * 0.155, s * 0.076, s * 0.026);
    ctx.fill();
    roundRect(ctx, headCx + s * 0.03, eyeY - s * 0.038, s * 0.155, s * 0.076, s * 0.026);
    ctx.fill();
    // 镜桥
    ctx.fillRect(headCx - s * 0.032, eyeY - s * 0.012, s * 0.064, s * 0.016);
    // 镜片反光
    ctx.fillStyle = 'rgba(90, 200, 255, 0.45)';
    roundRect(ctx, headCx - s * 0.17, eyeY - s * 0.028, s * 0.12, s * 0.055, s * 0.02);
    ctx.fill();
    roundRect(ctx, headCx + s * 0.045, eyeY - s * 0.028, s * 0.12, s * 0.055, s * 0.02);
    ctx.fill();
  } else if (avatar.expression === 'fake_smile') {
    // 笑眯眼
    ctx.strokeStyle = '#1a1a22';
    ctx.lineWidth = s * 0.024;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(headCx + side * eyeGap, eyeY, s * 0.035, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  } else {
    const eyeH = avatar.expression === 'angry' ? s * 0.022 : avatar.expression === 'smug' ? s * 0.018 : s * 0.026;
    ellipse(ctx, headCx - eyeGap, eyeY, s * 0.026, eyeH);
    ctx.fill();
    ellipse(ctx, headCx + eyeGap, eyeY, s * 0.026, eyeH);
    ctx.fill();
    // 高光点
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    circle(ctx, headCx - eyeGap + s * 0.009, eyeY - s * 0.008, s * 0.008);
    ctx.fill();
    circle(ctx, headCx + eyeGap + s * 0.009, eyeY - s * 0.008, s * 0.008);
    ctx.fill();
  }

  // ---- 普通眼镜
  if (avatar.accessory === 'glasses') {
    ctx.strokeStyle = '#3a3a46';
    ctx.lineWidth = s * 0.014;
    ctx.beginPath();
    ctx.arc(headCx - eyeGap, eyeY, s * 0.052, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(headCx + eyeGap, eyeY, s * 0.052, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(headCx - eyeGap + s * 0.05, eyeY);
    ctx.lineTo(headCx + eyeGap - s * 0.05, eyeY);
    ctx.stroke();
  }

  // ---- 鼻子
  ctx.strokeStyle = darken(avatar.skin, 0.82);
  ctx.lineWidth = s * 0.014;
  ctx.beginPath();
  ctx.moveTo(headCx, eyeY + s * 0.03);
  ctx.lineTo(headCx + s * 0.012, eyeY + s * 0.065);
  ctx.stroke();

  // ---- 嘴（按表情）
  const mouthY = headCy + s * 0.105;
  ctx.strokeStyle = '#5a2a2a';
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  switch (avatar.expression) {
    case 'smug':
      ctx.moveTo(headCx - s * 0.055, mouthY);
      ctx.quadraticCurveTo(headCx, mouthY + s * 0.03, headCx + s * 0.07, mouthY - s * 0.025);
      break;
    case 'sly':
      ctx.moveTo(headCx - s * 0.06, mouthY + s * 0.012);
      ctx.lineTo(headCx + s * 0.06, mouthY - s * 0.018);
      break;
    case 'angry':
      ctx.moveTo(headCx - s * 0.055, mouthY + s * 0.02);
      ctx.quadraticCurveTo(headCx, mouthY - s * 0.025, headCx + s * 0.055, mouthY + s * 0.02);
      break;
    case 'fake_smile':
      ctx.arc(headCx, mouthY - s * 0.01, s * 0.055, 0.15 * Math.PI, 0.85 * Math.PI);
      break;
    default:
      ctx.moveTo(headCx - s * 0.05, mouthY);
      ctx.lineTo(headCx + s * 0.05, mouthY);
      break;
  }
  ctx.stroke();

  // ---- 小胡子
  if (avatar.accessory === 'mustache') {
    ctx.fillStyle = '#2a2a32';
    ctx.beginPath();
    ctx.moveTo(headCx - s * 0.075, mouthY - s * 0.03);
    ctx.quadraticCurveTo(headCx, mouthY - s * 0.055, headCx + s * 0.075, mouthY - s * 0.03);
    ctx.quadraticCurveTo(headCx, mouthY - s * 0.012, headCx - s * 0.075, mouthY - s * 0.03);
    ctx.fill();
  }

  // ---- 雪茄
  if (avatar.accessory === 'cigar') {
    ctx.save();
    ctx.translate(headCx + s * 0.055, mouthY);
    ctx.rotate(-0.18);
    ctx.fillStyle = '#6b4a2f';
    roundRect(ctx, 0, -s * 0.014, s * 0.14, s * 0.028, s * 0.01);
    ctx.fill();
    // 火星
    ctx.fillStyle = '#ff6b3d';
    circle(ctx, s * 0.14, 0, s * 0.014);
    ctx.fill();
    // 烟
    ctx.strokeStyle = 'rgba(220,220,230,0.35)';
    ctx.lineWidth = s * 0.012;
    ctx.beginPath();
    ctx.moveTo(s * 0.15, -s * 0.02);
    ctx.quadraticCurveTo(s * 0.2, -s * 0.09, s * 0.16, -s * 0.14);
    ctx.stroke();
    ctx.restore();
  }

  // ---- 手持道具
  if (avatar.accessory === 'briefcase') {
    ctx.save();
    ctx.fillStyle = '#5a3a24';
    roundRect(ctx, s * 0.2, s * 0.26, s * 0.17, s * 0.13, s * 0.015);
    ctx.fill();
    ctx.strokeStyle = '#d9b25a';
    ctx.lineWidth = s * 0.012;
    ctx.beginPath();
    ctx.moveTo(s * 0.24, s * 0.26);
    ctx.lineTo(s * 0.24, s * 0.23);
    ctx.lineTo(s * 0.33, s * 0.23);
    ctx.lineTo(s * 0.33, s * 0.26);
    ctx.stroke();
    ctx.restore();
  }

  if (avatar.accessory === 'moneybag') {
    ctx.save();
    ctx.translate(-s * 0.24, s * 0.33);
    ctx.fillStyle = '#d9b25a';
    ctx.beginPath();
    ctx.moveTo(-s * 0.06, -s * 0.04);
    ctx.quadraticCurveTo(-s * 0.08, s * 0.06, 0, s * 0.06);
    ctx.quadraticCurveTo(s * 0.08, s * 0.06, s * 0.06, -s * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a07d2a';
    ctx.fillRect(-s * 0.025, -s * 0.055, s * 0.05, s * 0.022);
    ctx.fillStyle = '#7a5a10';
    ctx.font = `bold ${s * 0.05}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¥', 0, s * 0.012);
    ctx.restore();
  }

  ctx.restore();
}

// ---------------------------------------------------------------- 巴掌
/**
 * 画一只扇过来的手掌。
 *
 * 卡通画法：一个大椭圆做手掌 + 四根手指 + 大拇指。
 * 不画手腕和胳膊 —— 只要「手」这一块，才有一瞬间打脸的冲击感。
 *
 * @param progress 0-1，控制手掌从右侧扫入、到位的进度
 */
export function drawSlapHand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  progress: number,
  alpha: number,
  dir: -1 | 1 = 1,
): void {
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // 从侧面斜着扫过来；dir=-1 时镜像，从左边来
  const offset = (1 - progress) * size * 1.1;
  ctx.translate(x + offset * dir, y);
  ctx.scale(dir, 1);
  // 手斜着扇，不是垂直的
  ctx.rotate(-0.5);
  // 扇的动作：手略微变形，像被速度拉长
  const stretch = 1 + (1 - progress) * 0.15;

  const skin = '#ffd0a8';
  const skinDark = '#efae82';
  const outline = '#c98d63';

  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, size * 0.045);

  // ---- 手掌：一个偏方的圆
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.34 * stretch, size * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ---- 四根手指（朝上，短粗）
  const fingerOffsets = [-0.2, -0.068, 0.068, 0.2];
  const fingerLens = [0.2, 0.26, 0.25, 0.17];
  for (let i = 0; i < 4; i += 1) {
    const fx = fingerOffsets[i]! * size;
    const len = fingerLens[i]! * size;
    ctx.beginPath();
    ctx.ellipse(fx, -size * 0.32 - len * 0.3, size * 0.075, len, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ---- 大拇指（从右侧斜出来）
  ctx.beginPath();
  ctx.ellipse(size * 0.3, size * 0.06, size * 0.085, size * 0.19, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ---- 掌心阴影
  ctx.fillStyle = skinDark;
  ctx.globalAlpha = alpha * 0.3;
  ctx.beginPath();
  ctx.ellipse(-size * 0.04, size * 0.05, size * 0.16, size * 0.19, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 扇击的「啪」特效：几道从掌心放射出去的速度线 + 一个白色冲击环
 */
export function drawSlapImpact(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  progress: number,
  alpha: number,
): void {
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // 冲击环
  const ringR = size * (0.3 + progress * 0.9);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.09 * (1 - progress);
  ctx.beginPath();
  ctx.arc(x, y, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // 速度线（从中心往外炸）
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = size * 0.07 * (1 - progress);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const r1 = size * (0.35 + progress * 0.5);
    const r2 = size * (0.55 + progress * 1.1);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
    ctx.stroke();
  }

  // 星星（漫画式的「被打中」符号）
  ctx.fillStyle = '#fff3c4';
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 - 0.6;
    const r = size * (0.5 + progress * 0.7);
    const sx = x + Math.cos(a) * r;
    const sy = y + Math.sin(a) * r;
    const starR = size * 0.12 * (1 - progress * 0.5);
    ctx.beginPath();
    for (let k = 0; k < 5; k += 1) {
      const ang = (k / 5) * Math.PI * 2 - Math.PI / 2;
      const rr = k % 2 === 0 ? starR : starR * 0.45;
      const px = sx + Math.cos(ang) * rr;
      const py = sy + Math.sin(ang) * rr;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// ---------------------------------------------------------------- 精灵缓存
/**
 * 把静态内容预渲染到离屏 canvas，每帧只做 drawImage。
 *
 * 为什么重要：一副 8×8 棋盘每帧要画 64 个复杂图形，
 * 直接画会掉帧（尤其在低端手机上）。预渲染后每帧只有 64 次 drawImage。
 */
export class SpriteCache {
  private tiles = new Map<number, HTMLCanvasElement>();
  private discs = new Map<string, HTMLCanvasElement>();

  /** 取（或生成）一张牌面 */
  getTile(
    type: VillainType,
    size: number,
    poisoned: boolean,
    hp: number,
    variant = 0,
  ): HTMLCanvasElement {
    const key = hashKey(`${type}|${Math.round(size)}|${poisoned}|${hp}|${variant}`);
    const cached = this.tiles.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建离屏画布');
    ctx.scale(dpr, dpr);
    drawTileSprite(ctx, { type, size, poisoned, hp, variant });

    this.tiles.set(key, canvas);
    return canvas;
  }

  /** 取（或生成）一个发光圆点，用于粒子和光晕 */
  getDisc(color: string, radius: number): HTMLCanvasElement {
    const size = Math.max(4, Math.round(radius * 2));
    const key = `${color}|${size}`;
    const cached = this.discs.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建离屏画布');
    ctx.scale(dpr, dpr);

    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    this.discs.set(key, canvas);
    return canvas;
  }

  clear(): void {
    this.tiles.clear();
    this.discs.clear();
  }
}

function hashKey(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return h;
}

export { roundRect, circle, ellipse };
