/**
 * 问答系统单测
 *
 * 用户明确要求：问答「一次性、随机、不重复」。
 * 这三个词要拆成可验证的断言：
 *   一次性 → 答过的 id 不会再出现
 *   随机   → 不同 seed 抽到的题不同
 *   不重复 → 连续抽 N 次，id 集合无重叠
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QUIZZES, TOOLS, drawQuiz, getTool, describeEffect, judgeAnswer } from '../src/quiz.ts';
import { answerQuiz, shouldTriggerQuiz, triggerQuiz, QUIZ_EVERY } from '../src/game.ts';
import { createGame } from '../src/game.ts';

test('题库数量足够', () => {
  assert.ok(QUIZZES.length >= 20, `题库只有 ${QUIZZES.length} 条，太少`);
});

test('每道题都恰好有一个正确答案', () => {
  for (const q of QUIZZES) {
    const correct = q.options.filter((o) => o.correct);
    assert.equal(correct.length, 1, `${q.id} 的正确答案数量不对：${correct.length}`);
    assert.equal(q.options.length, 3, `${q.id} 应该有 3 个选项`);
  }
});

test('每道题的奖励工具都存在', () => {
  for (const q of QUIZZES) {
    assert.ok(TOOLS[q.reward], `${q.id} 的奖励 ${q.reward} 不存在`);
  }
});

test('题目标题不重复（防止复制粘贴）', () => {
  const prompts = new Set<string>();
  for (const q of QUIZZES) {
    assert.ok(!prompts.has(q.prompt), `重复的题干：${q.prompt}`);
    prompts.add(q.prompt);
  }
});

test('抽题会排除已答过的', () => {
  const first = drawQuiz(12345, []);
  const second = drawQuiz(12345, first.usedIds);
  assert.notEqual(first.quiz.id, second.quiz.id, '第二题不该和第一题相同');
});

test('连续抽 10 次不重复', () => {
  let used: string[] = [];
  const seen: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = drawQuiz(1000 + i * 7, used);
    seen.push(r.quiz.id);
    used = r.usedIds;
  }
  assert.equal(new Set(seen).size, seen.length, `出现了重复：${seen.join(',')}`);
});

test('不同 seed 抽到的第一题不同', () => {
  const a = drawQuiz(1, []);
  const b = drawQuiz(999999, []);
  // 极小概率相同，但 24 条里应该不一样
  assert.ok(a.quiz.id !== b.quiz.id || QUIZZES.length < 3);
});

test('池子抽空后会重置', () => {
  const allIds = QUIZZES.map((q) => q.id);
  const r = drawQuiz(42, allIds);
  assert.ok(r.quiz, '池子空了应该还能抽到');
  assert.equal(r.usedIds.length, 1, '重置后 usedIds 只含新抽的这条');
});

test('工具效果描述正确', () => {
  assert.equal(describeEffect({ kind: 'moves', amount: 3 }), '+3 步');
  assert.equal(describeEffect({ kind: 'score', amount: 600 }), '+600 分');
  assert.equal(describeEffect({ kind: 'rage', amount: 40 }), '怒值 +40%');
  assert.equal(describeEffect({ kind: 'clearRandom', amount: 6 }), '随机清掉 6 个');
});

test('getTool 查得到、查不到返回 null', () => {
  assert.ok(getTool('recorder'));
  assert.equal(getTool('不存在'), null);
});

// ---------------------------------------------------------------- 触发逻辑
test('刚开局不该弹问答', () => {
  const game = createGame(1, 42);
  assert.equal(shouldTriggerQuiz(game), false);
});

test('清理数跨过 12 就该弹', () => {
  const game = { ...createGame(1, 42), totalCleared: QUIZ_EVERY };
  assert.equal(shouldTriggerQuiz(game), true);
});

test('清理数不是门槛整数倍时，只要跨过就要弹', () => {
  // 这是实际踩到的 bug：一次消 8 个，可能正好跳过门槛
  const game = { ...createGame(1, 42), totalCleared: QUIZ_EVERY + 5, quizzesTaken: 0 };
  assert.equal(shouldTriggerQuiz(game), true, '跳过门槛也应该触发');
});

test('每局最多弹 3 次', () => {
  const game = { ...createGame(1, 42), totalCleared: 200, quizzesTaken: 3 };
  assert.equal(shouldTriggerQuiz(game), false, '达到上限后不该再弹');
});

test('答过一题后同一个门槛不再触发', () => {
  const game = { ...createGame(1, 42), totalCleared: 18, quizzesTaken: 1 };
  assert.equal(shouldTriggerQuiz(game), false);
});

test('有未答的题时不再叠加', () => {
  const game = createGame(1, 42);
  const withQuiz = { ...game, totalCleared: 30, pendingQuiz: QUIZZES[0]! };
  assert.equal(shouldTriggerQuiz(withQuiz), false);
});

test('答对给工具、答错没有', () => {
  const game = createGame(1, 42);
  const quiz = QUIZZES.find((q) => q.options.some((o) => o.correct))!;

  // 找到一个错误选项
  const wrongIdx = quiz.options.findIndex((o) => !o.correct);
  const wrong = answerQuiz({ ...game, pendingQuiz: quiz }, wrongIdx);
  assert.equal(wrong.granted, null);

  // 正确选项
  const rightIdx = quiz.options.findIndex((o) => o.correct);
  const right = answerQuiz({ ...game, pendingQuiz: quiz }, rightIdx);
  assert.ok(right.granted, '答对应给工具');
  assert.ok(right.granted!.name.length > 0);
});

test('答对后工具效果真的生效（步数）', () => {
  const game = createGame(1, 42);
  // 构造一道奖励为 +步 的题
  const quiz = QUIZZES.find((q) => TOOLS[q.reward]?.effect.kind === 'moves');
  assert.ok(quiz, '应该有一道题奖励步数');
  const rightIdx = quiz!.options.findIndex((o) => o.correct);
  const before = game.movesLeft;
  const after = answerQuiz({ ...game, pendingQuiz: quiz! }, rightIdx).state.movesLeft;
  assert.ok(after > before, `步数应该增加：${before} → ${after}`);
});

test('答题后 pendingQuiz 清空、计数 +1', () => {
  const game = createGame(1, 42);
  const quiz = QUIZZES[0]!;
  const { state } = answerQuiz({ ...game, pendingQuiz: quiz }, 0);
  assert.equal(state.pendingQuiz, null);
  assert.equal(state.quizzesTaken, 1);
});

test('清行工具真的清掉一整行（然后补满）', () => {
  const base = createGame(1, 42);
  // 有些题的最佳回应带棋盘条件 —— 铺满对应类型保证能拿到工具
  const quiz = QUIZZES.find((q) => TOOLS[q.reward]?.effect.kind === 'clearRow');
  const board = base.board.map((row) => row.map((t) => (t ? { ...t, type: 'pua' as const } : t)));
  const game = { ...base, board };
  assert.ok(quiz, '应该有一道题奖励清行');
  const rightIdx = quiz!.options.findIndex((o) => o.correct);
  const before = game.board.map((row) => row.filter(Boolean).length);
  const { state } = answerQuiz({ ...game, pendingQuiz: quiz! }, rightIdx);
  // 清完会补齐，所以棋盘应该还是满的
  const after = state.board.map((row) => row.filter(Boolean).length);
  assert.equal(after.reduce((a, b) => a + b, 0), before.reduce((a, b) => a + b, 0), '棋盘应该补满');
  assert.ok(state.score > game.score, '清行应该加分');
});

test('清列工具会加分（先把棋盘铺满足条件的类型）', () => {
  const base = createGame(1, 42);
  const quiz = QUIZZES.find((q) => TOOLS[q.reward]?.effect.kind === 'clearCol');
  assert.ok(quiz);

  // 这一题的最佳回应带条件（棋盘上要有足够多的甩锅侠），先把棋盘铺满
  const board = base.board.map((row) => row.map((t) => (t ? { ...t, type: 'shirk' as const } : t)));
  const game = { ...base, board };

  const rightIdx = quiz!.options.findIndex((o) => o.correct);
  const { state } = answerQuiz({ ...game, pendingQuiz: quiz! }, rightIdx);
  assert.ok(state.score > game.score);
});

test('评价：选对给「将了一军」', () => {
  const quiz = QUIZZES[0]!;
  const rightIdx = quiz.options.findIndex((o) => o.correct);
  const v = judgeAnswer(quiz, rightIdx);
  assert.equal(v.grade, 'good');
  assert.equal(v.title, '将了他一军');
});

test('评价：选错的第一项是「被压下去了」', () => {
  const quiz = QUIZZES[0]!;
  const wrongIdx = quiz.options.findIndex((o) => !o.correct);
  const v = judgeAnswer(quiz, wrongIdx);
  assert.equal(v.grade, 'bad');
});

test('triggerQuiz 会把题目写进 state', () => {
  const game = createGame(1, 42);
  const { state, usedIds } = triggerQuiz(game, [], 777);
  assert.ok(state.pendingQuiz);
  assert.equal(usedIds.length, 1);
});
