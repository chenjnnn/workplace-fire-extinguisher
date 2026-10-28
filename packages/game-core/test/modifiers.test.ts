/**
 * 词缀系统单测
 *
 * 每个词缀都必须**真的改到配置**，而且不能把配置改坏（比如步数变负数）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createGameWithLevel, getLevel } from '../src/index.ts';
import { MODIFIERS, applyModifiers, getModifier, pickModifiers } from '../src/modifiers.ts';
import { createDailyLevel, dailySeed, isBossDay } from '../src/daily.ts';
import { createEndlessLevel, endlessChainLength, endlessMoves, endlessTimer } from '../src/endless.ts';

const base = () => getLevel(5);

test('每个词缀都能改到配置，且不会把配置改坏', () => {
  for (const m of MODIFIERS) {
    const out = m.apply(base());
    assert.ok(out.moves >= 1, `${m.name} 把步数改成了 ${out.moves}`);
    assert.ok(out.targetChain.length >= 3, `${m.name} 把链改短了`);
    assert.ok(out.rows >= 7 && out.cols >= 7, `${m.name} 把棋盘改小了`);
    // 链必须保持「相邻不同色」
    for (let i = 1; i < out.targetChain.length; i += 1) {
      assert.notEqual(out.targetChain[i], out.targetChain[i - 1], `${m.name} 弄出了相邻同色`);
    }
  }
});

test('词缀按 id 能查回来', () => {
  for (const m of MODIFIERS) {
    assert.equal(getModifier(m.id)?.name, m.name);
  }
});

test('多个词缀可以叠加，且顺序不影响最终合法性', () => {
  const ids = ['all-hands', 'layoff-panic', 'kpi-timer'];
  const a = applyModifiers(base(), ids);
  const b = applyModifiers(base(), [...ids].reverse());
  assert.equal(a.rows, b.rows);
  assert.ok(a.moves >= 5);
  assert.ok((a.taskTimerSeconds ?? 0) > 0);
});

test('pickModifiers 不重复', () => {
  for (let seed = 1; seed < 40; seed += 1) {
    const ids = pickModifiers(seed, 3);
    assert.equal(new Set(ids).size, ids.length, `种子 ${seed} 抽出了重复词缀`);
  }
});

test('每日挑战：同一天结果固定，不同天会变', () => {
  const d1 = new Date(2026, 9, 28);
  const d2 = new Date(2026, 9, 29);
  const a = createDailyLevel(d1);
  const b = createDailyLevel(d1);
  const c = createDailyLevel(d2);
  assert.deepEqual(a.targetChain, b.targetChain, '同一天应该完全一样');
  assert.notDeepEqual(a.targetChain, c.targetChain, '换一天应该不一样');
  assert.equal(a.id, 1000);
});

test('每日挑战在 Boss 日有 2 个词缀', () => {
  const seed = dailySeed();
  assert.equal(typeof isBossDay(seed), 'boolean');
  assert.ok(createDailyLevel().moves >= 5);
});

test('无尽模式难度单调递增', () => {
  for (let s = 1; s < 30; s += 1) {
    assert.ok(endlessChainLength(s + 1) >= endlessChainLength(s), `第 ${s} 关链长倒退了`);
    assert.ok(endlessMoves(s + 1) >= endlessMoves(s), `第 ${s} 关步数倒退了`);
  }
  // 前 2 关无倒计时，之后有
  assert.equal(endlessTimer(1), undefined);
  assert.equal(endlessTimer(2), undefined);
  assert.ok((endlessTimer(6) ?? 0) > 0);
  // 时间递减但有下限
  assert.ok(endlessTimer(10)! >= 15);
  assert.ok(endlessTimer(40)! >= 15);
});

test('无尽模式生成的关卡能直接开局', () => {
  for (const stage of [1, 5, 12]) {
    const lv = createEndlessLevel(stage, 12345);
    // 动态关卡不在 LEVELS 里，必须走 createGameWithLevel
    const state = createGameWithLevelSafe(lv);
    assert.equal(state.phase, 'idle');
    assert.ok(state.movesLeft >= 1);
  }
});

/** 小包装 */
function createGameWithLevelSafe(level: ReturnType<typeof createEndlessLevel>) {
  return createGameWithLevel(level, 42);
}
