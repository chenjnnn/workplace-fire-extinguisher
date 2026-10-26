/**
 * 捏人系统 —— 参数化角色配置
 *
 * 合规要点（重要，别随手删）：
 *   这里的 AvatarConfig **只允许固定枚举**，没有任何自由文本字段。
 *   没有「姓名」「职务」「上传照片」这些东西，用户就捏不出可指认的真实人物。
 *   想加「拍照变卡通」必须走单独功能 + 明确标注虚构，不能塞进这里。
 */

import type { AvatarConfig, FaceShape, HairStyle, Outfit } from './types.ts';
import { AVATAR_OPTIONS, DEFAULT_AVATAR } from './types.ts';
import type { Rng } from './rng.ts';

/** 随机捏一个（开场给用户一个不空的形象） */
export function randomAvatar(rng: Rng): AvatarConfig {
  const pick = <T>(arr: readonly T[]): T => rng.pick(arr);

  return {
    gender: pick(AVATAR_OPTIONS.gender)[0],
    hair: pick(AVATAR_OPTIONS.hair)[0],
    hairColor: pick(AVATAR_OPTIONS.hairColor),
    face: pick(AVATAR_OPTIONS.face)[0],
    expression: pick(AVATAR_OPTIONS.expression)[0],
    outfit: pick(AVATAR_OPTIONS.outfit)[0],
    outfitColor: pick(AVATAR_OPTIONS.outfitColor),
    accessory: pick(AVATAR_OPTIONS.accessory)[0],
    brow: pick(AVATAR_OPTIONS.brow)[0],
    skin: pick(AVATAR_OPTIONS.skin),
  };
}

/** 校验：任何不在枚举里的值都回退到默认，防止存档被篡改导致渲染崩溃 */
export function sanitizeAvatar(input: unknown): AvatarConfig {
  const raw = (input ?? {}) as Partial<Record<keyof AvatarConfig, unknown>>;

  /**
   * 从白名单里取值。
   * 带 fallback 参数是必要的：noUncheckedIndexedAccess 下 list[0] 可能是 undefined，
   * 而这些列表是常量，理论上非空，所以用 fallback 兜住类型而不是加非空断言。
   */
  const allowed = <T extends string>(
    value: unknown,
    list: ReadonlyArray<readonly [T, string]>,
    fallback: T,
  ): T => {
    if (typeof value === 'string' && list.some(([v]) => v === value)) return value as T;
    return (list[0]?.[0] ?? fallback) as T;
  };
  const allowedColor = (value: unknown, list: readonly string[], fallback: string): string =>
    typeof value === 'string' && list.includes(value) ? value : (list[0] ?? fallback);

  return {
    gender: allowed(raw.gender, AVATAR_OPTIONS.gender, DEFAULT_AVATAR.gender),
    hair: allowed(raw.hair, AVATAR_OPTIONS.hair, DEFAULT_AVATAR.hair),
    hairColor: allowedColor(raw.hairColor, AVATAR_OPTIONS.hairColor, DEFAULT_AVATAR.hairColor),
    face: allowed(raw.face, AVATAR_OPTIONS.face, DEFAULT_AVATAR.face),
    expression: allowed(raw.expression, AVATAR_OPTIONS.expression, DEFAULT_AVATAR.expression),
    outfit: allowed(raw.outfit, AVATAR_OPTIONS.outfit, DEFAULT_AVATAR.outfit),
    outfitColor: allowedColor(raw.outfitColor, AVATAR_OPTIONS.outfitColor, DEFAULT_AVATAR.outfitColor),
    accessory: allowed(raw.accessory, AVATAR_OPTIONS.accessory, DEFAULT_AVATAR.accessory),
    brow: allowed(raw.brow, AVATAR_OPTIONS.brow, DEFAULT_AVATAR.brow),
    skin: allowedColor(raw.skin, AVATAR_OPTIONS.skin, DEFAULT_AVATAR.skin),
  };
}

/** 序列化成存档字符串 */
export function encodeAvatar(avatar: AvatarConfig): string {
  return JSON.stringify(sanitizeAvatar(avatar));
}

export function decodeAvatar(raw: string | null | undefined): AvatarConfig {
  if (!raw) return { ...DEFAULT_AVATAR };
  try {
    return sanitizeAvatar(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AVATAR };
  }
}

/**
 * 形象「人设标签」—— 根据配置生成一句调侃文案。
 *
 * 这是让捏人有意义的关键：不是捏完就完了，而是会被系统读出来调侃一句。
 * 全部基于本地规则，不调用 AI，所以免费且即时。
 */
export function avatarPersona(avatar: AvatarConfig): { title: string; line: string } {
  const { hair, accessory, expression, outfit, gender } = avatar;

  const titles: string[] = [];

  if (accessory === 'sunglasses') titles.push('墨镜一戴，谁都不爱');
  if (accessory === 'cigar') titles.push('雪茄不离手');
  if (accessory === 'moneybag') titles.push('钱包比人还厚');
  if (accessory === 'briefcase') titles.push('公文包比命重');
  if (accessory === 'glasses') titles.push('金丝眼镜，斯文败类');
  if (accessory === 'mustache') titles.push('八字胡一撇，权威感拉满');
  if (hair === 'slick') titles.push('大背头梳得一丝不乱');
  if (hair === 'mohawk') titles.push('鸡冠头，走在时代前列');
  if (hair === 'bowl') titles.push('西瓜头，过分年轻');
  if (hair === 'bald') titles.push('地中海，用地方支援中央');
  if (hair === 'bun') titles.push('丸子头，看着挺文艺');
  if (hair === 'long') titles.push('长发飘飘，很有艺术家气质');
  if (expression === 'smug') titles.push('一脸「我早就知道」');
  if (expression === 'sly') titles.push('笑得让人后背发凉');
  if (expression === 'angry') titles.push('眉头能夹死蚊子');
  if (expression === 'fake_smile') titles.push('假笑到脸抽筋');
  if (expression === 'neutral') titles.push('面无表情，深不可测');
  if (outfit === 'robe') titles.push('长袍加身，仙风道骨');
  if (outfit === 'uniform') titles.push('制服笔挺，气势汹汹');
  if (outfit === 'office_casual') titles.push('衬衫解开两颗扣子');
  if (gender === 'female' && hair === 'bun') titles.push('雷厉风行的女强人气场');

  const title = titles[0] ?? '面目模糊的上级';
  const extra = titles[1] ?? '反正你一看就知道是谁';

  return {
    title,
    line: `${title}，${extra}。`,
  };
}

/**
 * 生成「待救援者」形象 —— 受害的路人，不是「领导」。
 *
 * 和用户捏的领导要明确区分：
 *   · 不用墨镜/雪茄/钱袋/公文包这些「权力符号」
 *   · 表情只用中性或惊慌，不用得意/阴险
 *   · 用 seed 确定性生成，同一关每次都是同一个人（才有「救的是同一个人」的感觉）
 */
export function makeRescueAvatar(seed: number): AvatarConfig {
  const rng = createSeededRng(seed);

  const hairPool: HairStyle[] = ['short', 'long', 'bun', 'bowl', 'bald'];
  const facePool: FaceShape[] = ['round', 'square', 'long', 'sharp'];
  const outfitPool: Outfit[] = ['office_casual', 'uniform'];
  const outfitColors = ['#3b5a7a', '#6b5230', '#2d5b4a', '#5a4a6b', '#7a4a3a'];
  const skinPool = ['#f0c9a6', '#e0b08c', '#c98d63', '#a86b45'];

  return {
    gender: rng.pick(['male', 'female', 'neutral'] as const),
    hair: rng.pick(hairPool),
    hairColor: rng.pick(['#2b2b3a', '#6b4a2f', '#8a8a9a'] as const),
    face: rng.pick(facePool),
    // 受害者只有「面瘫」或「假笑（强撑）」两种表情，不能是一脸得意
    expression: rng.pick(['neutral', 'fake_smile'] as const),
    outfit: rng.pick(outfitPool),
    outfitColor: rng.pick(outfitColors),
    accessory: 'none',
    brow: rng.pick(['normal', 'arched'] as const),
    skin: rng.pick(skinPool),
  };
}

/**
 * 内部用的确定性 RNG。
 * 不用 rng.ts 的 createRng 是为了避免循环依赖（avatar 被 game 引，game 引 rng）。
 */
function createSeededRng(seed: number): { pick<T>(items: readonly T[]): T } {
  let s = seed >>> 0 || 0x9e3779b9;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    pick<T>(items: readonly T[]): T {
      const idx = Math.min(items.length - 1, Math.floor(next() * items.length));
      return items[idx] as T;
    },
  };
}

/** 预设形象，给不想捏的人一键选用 */
export const PRESET_AVATARS: Array<{ name: string; avatar: AvatarConfig }> = [
  {
    name: '老派处长',
    avatar: {
      gender: 'male',
      hair: 'slick',
      hairColor: '#2b2b3a',
      face: 'square',
      expression: 'smug',
      outfit: 'suit',
      outfitColor: '#2f3b52',
      accessory: 'glasses',
      brow: 'thick',
      skin: '#e0b08c',
    },
  },
  {
    name: '话痨主管',
    avatar: {
      gender: 'female',
      hair: 'bun',
      hairColor: '#6b4a2f',
      face: 'round',
      expression: 'fake_smile',
      outfit: 'office_casual',
      outfitColor: '#7a2431',
      accessory: 'none',
      brow: 'arched',
      skin: '#f0c9a6',
    },
  },
  {
    name: '暴躁老板',
    avatar: {
      gender: 'male',
      hair: 'bald',
      hairColor: '#8a8a9a',
      face: 'long',
      expression: 'angry',
      outfit: 'suit',
      outfitColor: '#1f1f23',
      accessory: 'cigar',
      brow: 'angry',
      skin: '#c98d63',
    },
  },
  {
    name: '神秘顾问',
    avatar: {
      gender: 'neutral',
      hair: 'long',
      hairColor: '#e8e8ef',
      face: 'sharp',
      expression: 'sly',
      outfit: 'robe',
      outfitColor: '#4a3b6b',
      accessory: 'sunglasses',
      brow: 'normal',
      skin: '#f0c9a6',
    },
  },
];

/** 是否「接近」某个预设（用于 UI 高亮） */
export function resemblesPreset(avatar: AvatarConfig): string | null {
  for (const preset of PRESET_AVATARS) {
    const same =
      preset.avatar.hair === avatar.hair &&
      preset.avatar.accessory === avatar.accessory &&
      preset.avatar.expression === avatar.expression &&
      preset.avatar.outfit === avatar.outfit;
    if (same) return preset.name;
  }
  return null;
}
