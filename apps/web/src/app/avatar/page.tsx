'use client';

/**
 * 捏人页
 *
 * 合规设计（重要）：
 *   这里**只有固定选项**，没有姓名输入、没有照片上传、没有文字描述。
 *   用户能做的只是从枚举里挑组合，因此不可能生成可指认的真实人物。
 *   如果将来要加「拍照生成卡通形象」，必须走独立入口 + 明确标注 + 服务端审核，
 *   绝不能直接加进这个页面。
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AVATAR_OPTIONS,
  PRESET_AVATARS,
  avatarPersona,
  randomAvatar,
  sanitizeAvatar,
  createRng,
  type AvatarConfig,
} from '@vc/core';
import { AvatarFigure } from '@/components/art';
import { loadSave, persistSave } from '@/lib/save';

type OptionKey = keyof typeof AVATAR_OPTIONS;

const GROUPS: Array<{ key: OptionKey; label: string; type: 'enum' | 'color' }> = [
  { key: 'gender', label: '性别气质', type: 'enum' },
  { key: 'face', label: '脸型', type: 'enum' },
  { key: 'hair', label: '发型', type: 'enum' },
  { key: 'hairColor', label: '发色', type: 'color' },
  { key: 'brow', label: '眉毛', type: 'enum' },
  { key: 'expression', label: '表情', type: 'enum' },
  { key: 'outfit', label: '行头', type: 'enum' },
  { key: 'outfitColor', label: '衣服颜色', type: 'color' },
  { key: 'accessory', label: '随身道具', type: 'enum' },
  { key: 'skin', label: '肤色', type: 'color' },
];

export default function AvatarPage() {
  const [avatar, setAvatar] = useState<AvatarConfig | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAvatar(loadSave().avatar);
  }, []);

  if (!avatar) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#38e1ff]" />
      </main>
    );
  }

  const persona = avatarPersona(avatar);

  const update = (patch: Partial<AvatarConfig>) => {
    setAvatar((prev) => (prev ? sanitizeAvatar({ ...prev, ...patch }) : prev));
    setSaved(false);
  };

  const save = () => {
    const data = loadSave();
    persistSave({ ...data, avatar });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const randomize = () => {
    const rng = createRng(Date.now() % 100000);
    update(randomAvatar(rng));
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/4 text-white/70 hover:bg-white/10"
            aria-label="返回首页"
          >
            ←
          </Link>
          <div>
            <h1 className="text-lg font-bold">捏个领导</h1>
            <p className="text-[11px] text-white/40">全部是虚构卡通形象</p>
          </div>
        </div>
        <button type="button" onClick={randomize} className="btn btn-ghost !px-3 !py-1.5 !text-xs">
          随机
        </button>
      </header>

      {/* 预览 */}
      <section className="panel relative mt-4 flex flex-col items-center py-5">
        <div className="absolute top-6 h-32 w-32 rounded-full bg-[#38e1ff]/10 blur-2xl" />
        <AvatarFigure avatar={avatar} size={180} className="relative" />
        <p className="relative mt-2 max-w-[16rem] px-4 text-center text-xs leading-relaxed text-white/60">
          {persona.line}
        </p>
      </section>

      {/* 预设 */}
      <section className="mt-3">
        <p className="mb-1.5 text-[11px] uppercase tracking-widest text-white/35">现成的几种</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PRESET_AVATARS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => update(preset.avatar)}
              className="tap-card flex shrink-0 flex-col items-center px-2 py-1.5"
            >
              <AvatarFigure avatar={preset.avatar} size={56} />
              <span className="mt-0.5 text-[10px] text-white/55">{preset.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 选项 */}
      <section className="mt-3 space-y-3.5">
        {GROUPS.map((group) => {
          const options = AVATAR_OPTIONS[group.key];
          if (group.type === 'color') {
            const colors = options as readonly string[];
            return (
              <div key={group.key}>
                <p className="mb-1.5 text-[11px] uppercase tracking-widest text-white/35">{group.label}</p>
                <div className="flex flex-wrap gap-2">
                  {colors.map((color) => {
                    const active = avatar[group.key] === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => update({ [group.key]: color } as Partial<AvatarConfig>)}
                        className={`h-8 w-8 rounded-full border-2 transition ${
                          active ? 'scale-110 border-white' : 'border-white/20 hover:border-white/50'
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`${group.label} ${color}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          }

          const enumOptions = options as ReadonlyArray<readonly [string, string]>;
          return (
            <div key={group.key}>
              <p className="mb-1.5 text-[11px] uppercase tracking-widest text-white/35">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {enumOptions.map(([value, label]) => {
                  const active = avatar[group.key] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => update({ [group.key]: value } as Partial<AvatarConfig>)}
                      className={`chip ${active ? 'chip-on' : ''}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* 说明 */}
      <section className="mt-5 rounded-xl border border-[#ffc93c]/25 bg-[#ffc93c]/8 px-3.5 py-3">
        <p className="text-[11px] leading-relaxed text-[#ffd970]">
          这里只提供固定选项，<b>不能上传照片、不能填写真实姓名</b>。
          这样既能捏出你心里那个「熟悉的讨厌鬼」，又不会变成给真人做肖像——
          上线审核也才过得去。
        </p>
      </section>

      <div className="mt-4 flex gap-2.5">
        <button type="button" onClick={save} className="btn btn-primary flex-1">
          {saved ? '已保存 ✓' : '保存形象'}
        </button>
        <Link href="/play/?level=1" className="btn btn-ghost">
          去玩
        </Link>
      </div>
    </main>
  );
}
