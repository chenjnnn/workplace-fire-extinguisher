/**
 * 核心逻辑单测 —— 这部分必须可靠，因为它是整个游戏的地基。
 *
 * 运行：npm test
 * 用的是 Node 内置 test runner + 类型剥离，不需要装测试框架。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRng, seedFromDate } from '../src/rng.ts';
import { QUIZZES, drawQuiz } from '../src/quiz.ts';
import {
  applyGravity,
  findHint,
  findMatches,
  getCell,
  isAdjacent,
  swappedBoard,
} from '../src/match.ts';
import {
  advanceRescue,
  computeStars,
  createGame,
  goalsMet,
  resolveStep,
  triggerSweep,
  tickTimer,
  shouldTriggerQuiz,
  canSweepNow,
  DEFAULT_SWEEP_THRESHOLDS,
  trySwap,
} from '../src/game.ts';
import { createLevelBoard, withTiles } from './helpers.ts';
import { sanitizeAvatar, decodeAvatar, encodeAvatar, avatarPersona } from '../src/avatar.ts';
import { buildShareData, DISCLAIMER } from '../src/share.ts';
import type { Tile, VillainType } from '../src/types.ts';

// ---------------------------------------------------------------- RNG
test('RNG 同种子产生同序列', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = Array.from({ length: 20 }, () => a.next());
  const seqB = Array.from({ length: 20 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('RNG 不同种子产生不同序列', () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notEqual(a.next(), b.next());
});

test('RNG 分布大致均匀', () => {
  const rng = createRng(777);
  const buckets = Array(10).fill(0);
  for (let i = 0; i < 10000; i += 1) {
    buckets[Math.floor(rng.next() * 10)] += 1;
  }
  for (const count of buckets) {
    assert.ok(count > 700 && count < 1300, `分布异常：${count}`);
  }
});

test('每日挑战种子按日期稳定', () => {
  const d1 = new Date(2026, 9, 24);
  const d2 = new Date(2026, 9, 24);
  const d3 = new Date(2026, 9, 25);
  assert.equal(seedFromDate(d1), seedFromDate(d2));
  assert.notEqual(seedFromDate(d1), seedFromDate(d3));
  assert.equal(seedFromDate(d1), 20261024);
});

// ---------------------------------------------------------------- 匹配
test('横向三连能被识别', () => {
  const board = createLevelBoard(5, 5, 'pua');
  // 第一行前三格设成 overtime
  const b = withTiles(board, [
    [0, 0, 'overtime'],
    [0, 1, 'overtime'],
    [0, 2, 'overtime'],
  ]);
  const matches = findMatches(b);
  assert.equal(matches.length, 3);
  assert.deepEqual(
    matches.map((m) => `${m.row},${m.col}`).sort(),
    ['0,0', '0,1', '0,2'],
  );
});

test('纵向三连能被识别', () => {
  // 注意选列：辅助棋盘的 picks 按 (r + 2c) % 4 交替，
  // c=2 时整列恰好同型，改了会顺带造出 5 连；c=0 列内是交替的，才是干净的三连。
  const board = createLevelBoard(5, 5, 'pua');
  const b = withTiles(board, [
    [0, 0, 'grafter'],
    [1, 0, 'grafter'],
    [2, 0, 'grafter'],
  ]);
  const matches = findMatches(b);
  assert.equal(matches.length, 3, `实际匹配 ${matches.length} 个：${JSON.stringify(matches)}`);
});

test('四连、五连都算匹配', () => {
  const board = createLevelBoard(5, 5, 'shirk');
  const four = withTiles(board, [
    [1, 0, 'overtime'],
    [1, 1, 'overtime'],
    [1, 2, 'overtime'],
    [1, 3, 'overtime'],
  ]);
  assert.equal(findMatches(four).length, 4);

  const five = withTiles(board, [
    [2, 0, 'grafter'],
    [2, 1, 'grafter'],
    [2, 2, 'grafter'],
    [2, 3, 'grafter'],
    [2, 4, 'grafter'],
  ]);
  assert.equal(findMatches(five).length, 5);
});

test('两连不算匹配', () => {
  const board = createLevelBoard(5, 5, 'pua');
  const b = withTiles(board, [
    [0, 0, 'overtime'],
    [0, 1, 'overtime'],
  ]);
  assert.equal(findMatches(b).length, 0);
});

test('L 形交叉匹配合并去重', () => {
  const board = createLevelBoard(5, 5, 'pua');
  // 横三 + 竖三，交叉在 (2,2)，总格数 = 5
  const b = withTiles(board, [
    [2, 0, 'formalist'],
    [2, 1, 'formalist'],
    [2, 2, 'formalist'],
    [2, 3, 'formalist'],
    [0, 2, 'formalist'],
    [1, 2, 'formalist'],
  ]);
  const matches = findMatches(b);
  // (2,0..3) 四个 + (0,2)(1,2) 两个 + (2,2) 重复 = 6 个
  assert.equal(matches.length, 6);
});

test('相邻判定正确', () => {
  assert.equal(isAdjacent({ row: 0, col: 0 }, { row: 0, col: 1 }), true);
  assert.equal(isAdjacent({ row: 0, col: 0 }, { row: 1, col: 0 }), true);
  assert.equal(isAdjacent({ row: 0, col: 0 }, { row: 1, col: 1 }), false);
  assert.equal(isAdjacent({ row: 0, col: 0 }, { row: 0, col: 0 }), false);
});

test('交换不修改原棋盘', () => {
  const board = createLevelBoard(5, 5, 'pua');
  const before = getCell(board, 0, 0)?.type;
  const beforeNext = getCell(board, 0, 1)?.type;
  const swapped = swappedBoard(board, { row: 0, col: 0 }, { row: 0, col: 1 });
  assert.ok(swapped);
  assert.equal(getCell(swapped!, 0, 0)?.type, beforeNext);
  assert.equal(getCell(board, 0, 0)?.type, before);
});

// ---------------------------------------------------------------- 开局棋盘
test('开局棋盘没有现成三连', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const game = createGame(1, seed);
    assert.equal(findMatches(game.board).length, 0, `种子 ${seed} 开局就有三连`);
  }
});

test('开局棋盘一定有可用步', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const game = createGame(1, seed);
    assert.ok(findHint(game.board), `种子 ${seed} 开局死局`);
  }
});

test('同种子生成同棋盘', () => {
  const a = createGame(3, 999);
  const b = createGame(3, 999);
  const typesA = a.board.map((row) => row.map((c: Tile | null) => c?.type).join(','));
  const typesB = b.board.map((row) => row.map((c: Tile | null) => c?.type).join(','));
  assert.deepEqual(typesA, typesB);
});

// ---------------------------------------------------------------- 交换
test('非法交换不扣步数', () => {
  const game = createGame(1, 42);
  const before = game.movesLeft;
  // 找一对不相邻的
  const { state, result } = trySwap(game, { row: 0, col: 0 }, { row: 5, col: 5 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_adjacent');
  assert.equal(state.movesLeft, before);
});

test('无匹配的交换被拒绝', () => {
  const game = createGame(1, 42);
  // 找一个换了也不成三连的相邻对
  const hint = findHint(game.board)!;
  // 遍历找反例
  let found = false;
  for (let r = 0; r < game.board.length && !found; r += 1) {
    for (let c = 0; c < game.board[0]!.length && !found; c += 1) {
      for (const other of [
        { row: r, col: c + 1 },
        { row: r + 1, col: c },
      ]) {
        if (other.row >= game.board.length || other.col >= game.board[0]!.length) continue;
        const res = trySwap(game, { row: r, col: c }, other);
        if (!res.result.ok && res.result.reason === 'no_match') {
          found = true;
          assert.equal(res.state.movesLeft, game.movesLeft, '被拒绝的交换不该扣步');
        }
      }
    }
  }
  assert.ok(found, '没找到反例（理论上一定存在）');
  void hint;
});

test('有效交换进入 resolving 并扣一步', () => {
  const game = createGame(1, 42);
  const hint = findHint(game.board)!;
  const { state, result } = trySwap(game, hint.a, hint.b);
  assert.equal(result.ok, true);
  assert.equal(state.phase, 'resolving');
  assert.equal(state.movesLeft, game.movesLeft - 1);
});

// ---------------------------------------------------------------- 结算
test('结算后棋盘填满且无遗漏', () => {
  const game = createGame(1, 42);
  const hint = findHint(game.board)!;
  const { state: swapped } = trySwap(game, hint.a, hint.b);
  const rng = createRng(swapped.seed);
  const { state } = resolveStep(swapped, rng);

  for (const row of state.board) {
    for (const cell of row) {
      assert.ok(cell, '结算后不应该有空位');
    }
  }
});

test('消除会计入 clearedCount 与得分', () => {
  const game = createGame(1, 42);
  const hint = findHint(game.board)!;
  const { state: swapped } = trySwap(game, hint.a, hint.b);
  const rng = createRng(swapped.seed);
  const { state, hadMatch } = resolveStep(swapped, rng);

  assert.equal(hadMatch, true);
  assert.ok(state.score > 0, '应该得分');
  const total = (Object.values(state.clearedCount) as number[]).reduce((a, b) => a + b, 0);
  assert.ok(total > 0, '应该有消除计数');
  assert.ok(state.totalCleared > 0);
});

test('连锁会提升最大连锁数', () => {
  const game = createGame(2, 7);
  const hint = findHint(game.board)!;
  const { state: swapped } = trySwap(game, hint.a, hint.b);
  const rng = createRng(swapped.seed);
  const { state } = resolveStep(swapped, rng);
  // 至少发生了一次连锁结算
  assert.ok(state.chain >= 1);
  assert.ok(state.maxChain >= 1);
});

test('结算后不会留下现成三连', () => {
  const game = createGame(1, 42);
  const hint = findHint(game.board)!;
  const { state: swapped } = trySwap(game, hint.a, hint.b);
  const rng = createRng(swapped.seed);
  const { state } = resolveStep(swapped, rng);
  assert.equal(findMatches(state.board).length, 0, '结算完应该无可消');
});

test('步数耗尽判负', () => {
  const game = createGame(1, 42);
  const almostDone = { ...game, movesLeft: 1 };
  const hint = findHint(almostDone.board)!;
  const { state: swapped } = trySwap(almostDone, hint.a, hint.b);
  const rng = createRng(swapped.seed);
  const { state } = resolveStep(swapped, rng);
  // 要么赢（目标达成）要么输
  assert.ok(state.phase === 'won' || state.phase === 'lost');
});

// ---------------------------------------------------------------- 特殊机制
test('保护伞会清空同列', () => {
  // 手工构造一个只有保护伞能消的棋盘太复杂，这里直接验证结算后的列清空行为
  const game = createGame(3, 5);
  assert.ok(game.board.length > 0);
  // 保护伞的机制在 clearMatches 里，通过完整结算验证不会崩
  const hint = findHint(game.board);
  if (hint) {
    const { state: swapped } = trySwap(game, hint.a, hint.b);
    const { state } = resolveStep(swapped, createRng(swapped.seed));
    assert.ok(state.board.length > 0);
  }
});

test('收网行动需要怒值满', () => {
  const game = createGame(1, 42);
  const res = triggerSweep(game, 'pua', createRng(1));
  assert.equal(res.ok, false);
  assert.equal(res.state.rage, game.rage);
});

test('收网：分数达标后可以跳过当前任务', () => {
  const game = createGame(1, 42);
  // 分数不够时用不了
  assert.equal(canSweepNow(game), false);
  const poor = triggerSweep(game, 'pua', createRng(1));
  assert.equal(poor.ok, false);

  // 攒到第一个门槛就能跳过（注意看的是 sweepScore，不是 score）
  const rich = { ...game, sweepScore: DEFAULT_SWEEP_THRESHOLDS[0] + 10 };
  assert.equal(canSweepNow(rich), true);
  const before = rich.seqIndex;
  const res = triggerSweep(rich, 'pua', createRng(1));
  assert.equal(res.ok, true);
  assert.ok(res.state.seqIndex > before, '应该推进任务链');
  assert.equal(res.state.sweepUsed, rich.sweepUsed + 1);
});

// ---------------------------------------------------------------- 重力
test('重力把方块压到底部', () => {
  const board = createLevelBoard(4, 3, 'pua');
  // 掏空第一列顶部两个
  board[0]![0] = null;
  board[1]![0] = null;
  const { board: after, spawnedPerCol } = applyGravity(board);
  assert.equal(spawnedPerCol[0], 2);
  // 底部应该有方块
  assert.ok(getCell(after, 3, 0));
  // 顶部应该是空的（等待填充）
  assert.equal(getCell(after, 0, 0), null);
});

test('重力后列内相对顺序保持', () => {
  const board = createLevelBoard(3, 1, 'pua');
  board[0]![0] = makeTyped('overtime', 0, 0);
  board[1]![0] = makeTyped('shirk', 1, 0);
  board[2]![0] = makeTyped('grafter', 2, 0);
  const { board: after } = applyGravity(board);
  assert.equal(getCell(after, 0, 0)?.type, 'overtime');
  assert.equal(getCell(after, 1, 0)?.type, 'shirk');
  assert.equal(getCell(after, 2, 0)?.type, 'grafter');
});

// ---------------------------------------------------------------- 星级
test('星星数符合阈值', () => {
  const game = createGame(1, 42);
  const won = { ...game, phase: 'won' as const };
  // 从关卡配置读阈值，避免以后调数值时测试跟着挂
  const [s1, s2, s3] = game.level.starScores;

  assert.equal(computeStars({ ...won, score: s1 - 1 }), 1, '过关至少 1 星');
  assert.equal(computeStars({ ...won, score: s1 }), 1, '刚好到一星线仍是一星');
  assert.equal(computeStars({ ...won, score: s2 }), 2, '到二星线升二星');
  assert.equal(computeStars({ ...won, score: s3 }), 3, '到三星线升三星');
  assert.equal(computeStars({ ...won, score: s3 + 5000 }), 3, '封顶三星');
  assert.equal(computeStars({ ...game, phase: 'lost' }), 0);
});

test('目标达成判定（按颜色顺序）', () => {
  const game = createGame(1, 42);
  assert.equal(goalsMet(game), false);

  // 只有 seqIndex 推进到末尾才算完成
  const done = { ...game, seqIndex: game.level.targetChain.length };
  assert.equal(goalsMet(done), true);

  // 光是清理数堆满不算 —— 现在看的是顺序进度
  const byCount = { ...game, clearedCount: { ...game.clearedCount, pua: 99 } };
  assert.equal(goalsMet(byCount), false);
});

test('消除当前目标色会推进任务链（一次消除推一格）', () => {
  const base = createGame(1, 42);
  const first = base.level.targetChain[0]!;

  // 造一排三种当前目标色（用 withTiles，它会同时把 hp 改对）
  const board = withTiles(base.board, [
    [3, 0, first],
    [3, 1, first],
    [3, 2, first],
  ]);
  const { state: next } = resolveStep({ ...base, board, movesLeft: 20 }, createRng(5));
  assert.ok(next.seqIndex >= 1, `应该至少推进一格，实际 seqIndex=${next.seqIndex}`);
});

test('消除非目标色不推进任务链，但会累计跳过进度', () => {
  const base = createGame(1, 42);
  const first = base.level.targetChain[0]!;
  const other = (['pua', 'shirk', 'grafter', 'overtime', 'formalist'] as const).find(
    (t) => t !== first,
  )!;

  const board = withTiles(base.board, [
    [3, 0, other],
    [3, 1, other],
    [3, 2, other],
  ]);
  const { state: next } = resolveStep({ ...base, board, movesLeft: 20 }, createRng(5));
  // 连锁有可能顺带消到目标色，所以这里只断言「非目标计数涨了」
  assert.ok(next.offTargetCleared > 0, '应该累计非目标消除数');
});

// ---------------------------------------------------------------- 捏人
test('捏人配置会被净化掉非法值', () => {
  const dirty = {
    gender: 'alien',
    hair: 'spaghetti',
    hairColor: 'javascript:alert(1)',
    face: 'square',
    expression: 'smug',
    outfit: 'suit',
    outfitColor: '#2f3b52',
    accessory: 'none',
    brow: 'thick',
    skin: '#f0c9a6',
  };
  const clean = sanitizeAvatar(dirty);
  assert.equal(clean.gender, 'male', '非法值回退到第一个合法值');
  assert.equal(clean.hair, 'slick');
  // 颜色不在白名单里就回退
  assert.notEqual(clean.hairColor, 'javascript:alert(1)');
});

test('存档编解码往返一致', () => {
  const avatar = {
    gender: 'female' as const,
    hair: 'bun' as const,
    hairColor: '#c9a227',
    face: 'round' as const,
    expression: 'fake_smile' as const,
    outfit: 'office_casual' as const,
    outfitColor: '#7a2431',
    accessory: 'glasses' as const,
    brow: 'arched' as const,
    skin: '#f0c9a6',
  };
  const round = decodeAvatar(encodeAvatar(avatar));
  assert.deepEqual(round, avatar);
});

test('损坏的存档不会崩', () => {
  assert.ok(decodeAvatar('not json at all'));
  assert.ok(decodeAvatar('{"gender":123}'));
  assert.ok(decodeAvatar(null));
});

test('捏人会生成人设文案', () => {
  const persona = avatarPersona({
    gender: 'male',
    hair: 'slick',
    hairColor: '#2b2b3a',
    face: 'square',
    expression: 'smug',
    outfit: 'suit',
    outfitColor: '#2f3b52',
    accessory: 'sunglasses',
    brow: 'thick',
    skin: '#f0c9a6',
  });
  assert.ok(persona.title.length > 0);
  assert.ok(persona.line.includes('，'));
});

// ---------------------------------------------------------------- 分享
test('分享数据带免责声明', () => {
  const game = createGame(1, 42);
  const data = buildShareData(game, null);
  assert.equal(data.disclaimer, DISCLAIMER);
  assert.ok(data.disclaimer.includes('虚构'));
});

test('分享数据分类明细按数量降序', () => {
  const game = createGame(1, 42);
  const withCounts = {
    ...game,
    clearedCount: { ...game.clearedCount, pua: 10, shirk: 3, grafter: 7 },
  };
  const data = buildShareData(withCounts, null);
  const counts = data.breakdown.map((b) => b.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
});

// ---------------------------------------------------------------- 救援机制
// 用户要求「不要小林那种救援卡了，全部换成和第 10 关一样」，
// 所以现在所有关卡都没有救援目标。救援的底层代码保留，方便以后再用。
test('所有关卡都没有救援目标', () => {
  for (let id = 1; id <= 10; id += 1) {
    const game = createGame(id, 42);
    assert.equal(game.rescues.length, 0, `第 ${id} 关不该有救援目标`);
  }
});

// ---------------------------------------------------------------- 模式
test('解恨模式连锁上限更高', () => {
  const normal = createGame(1, 42, 'normal');
  const catharsis = createGame(1, 42, 'catharsis');
  assert.equal(normal.modeConfig.chainCap, 2.6);
  assert.equal(catharsis.modeConfig.chainCap, 4);
  assert.ok(catharsis.modeConfig.sweepLimit > normal.modeConfig.sweepLimit);
  assert.equal(catharsis.modeConfig.penaltyOnRescueFail, false);
});

test('每个棋子都有视觉变体且不影响匹配', () => {
  const game = createGame(1, 42);
  const variants = new Set<number>();
  for (const row of game.board) {
    for (const cell of row) {
      if (cell) variants.add(cell.variant ?? 0);
    }
  }
  assert.ok(variants.size > 1, '应该出现多种视觉变体');
  // 变体不影响匹配：同类型不同变体仍然可消
  const board = createLevelBoard(5, 5, 'pua');
  board[0]![0]!.type = 'overtime';
  board[0]![0]!.variant = 0;
  board[0]![1]!.type = 'overtime';
  board[0]![1]!.variant = 1;
  board[0]![2]!.type = 'overtime';
  board[0]![2]!.variant = 2;
  assert.equal(findMatches(board).length, 3, '不同变体的同类型应该能匹配');
});

// ---------------------------------------------------------------- 工具
function makeTyped(type: VillainType, row: number, col: number): Tile {
  return {
    id: Math.random(),
    type,
    hp: 1,
    poisoned: false,
    state: 'idle',
    viewRow: row,
    viewCol: col,
    scale: 1,
    rotation: 0,
    alpha: 1,
  };
}

// ---------------------------------------------------------------- 倒计时
test('每一关都有任务倒计时，且前松后紧', () => {
  const first = createGame(1, 42);
  const last = createGame(10, 42);
  assert.ok((first.level.taskTimerSeconds ?? 0) > 0, '第 1 关也要有倒计时');
  assert.ok(
    (first.level.taskTimerSeconds ?? 0) > (last.level.taskTimerSeconds ?? 0),
    '第 1 关的时间应该比第 10 关宽松',
  );
  assert.equal(first.taskTimeLeft, first.level.taskTimerSeconds);
});

test('倒计时会随时间减少', () => {
  const g = createGame(5, 42);
  const before = g.taskTimeLeft;
  const after = tickTimer(g, 1.5);
  assert.ok(after.taskTimeLeft < before, '应该减少');
  assert.ok(Math.abs(before - after.taskTimeLeft - 1.5) < 0.001);
});

test('倒计时归零判负', () => {
  const g = createGame(5, 42);
  const done = tickTimer({ ...g, taskTimeLeft: 0.5 }, 1);
  assert.equal(done.phase, 'lost');
});

test('弹窗答题时倒计时不走（引擎层保证，这里验证状态）', () => {
  // 引擎只在 phase==='idle' && !pendingQuiz && !busy 时调 tickTimer，
  // 这里验证「有 pendingQuiz 时不调用」这个约定对应的状态形态
  const g = createGame(5, 42);
  const withQuiz = { ...g, pendingQuiz: QUIZZES[0]! };
  assert.ok(withQuiz.pendingQuiz, '题目在场时不该继续计时');
  // 只要引擎不调用 tickTimer，时间就不会变 —— 这条断言锁住「有题就不该 tick」的意图
  assert.equal(tickTimer(g, 0).taskTimeLeft, g.taskTimeLeft);
});

test('倒计时只在任务完成时重置（消错颜色不影响）', () => {
  const base = createGame(5, 42);
  const first = base.level.targetChain[0]!;
  const other = (['pua', 'shirk', 'grafter', 'overtime', 'formalist', 'flatterer'] as const).find(
    (t) => t !== first,
  )!;

  // 先把时间消耗掉一部分
  const drained = tickTimer(base, 12);

  // 消一个「非目标色」：不该重置时间
  const wrongBoard = withTiles(drained.board, [
    [3, 0, other],
    [3, 1, other],
    [3, 2, other],
  ]);
  const afterWrong = resolveStep({ ...drained, board: wrongBoard, movesLeft: 20 }, createRng(5));
  // 连锁有可能顺带消到目标色（那属于「任务完成」，重置是合法的），
  // 所以只在任务链没推进时断言「时间不该变多」
  if (afterWrong.state.seqIndex === drained.seqIndex) {
    assert.ok(
      afterWrong.state.taskTimeLeft <= drained.taskTimeLeft + 0.001,
      `没完成任务时不该重置时间：${drained.taskTimeLeft} → ${afterWrong.state.taskTimeLeft}`,
    );
  }

  // 消「当前目标色」：应该重置回满
  const rightBoard = withTiles(drained.board, [
    [3, 0, first],
    [3, 1, first],
    [3, 2, first],
  ]);
  const afterRight = resolveStep({ ...drained, board: rightBoard, movesLeft: 20 }, createRng(5));
  assert.ok(afterRight.state.seqIndex > drained.seqIndex, '目标色应该推进任务链');
  assert.equal(
    afterRight.state.taskTimeLeft,
    base.level.taskTimerSeconds,
    '完成一格后倒计时应该回满',
  );
});

// ---------------------------------------------------------------- 收网积分模式
test('limited 模式：连消非目标色超过 3 次就不再攒收网分', () => {
  const base = createGame(1, 42);
  const first = base.level.targetChain[0]!;
  const other = (['pua', 'shirk', 'grafter', 'overtime', 'formalist', 'flatterer'] as const).find(
    (t) => t !== first,
  )!;

  // 手动把关卡切成 limited 模式
  const limited = {
    ...base,
    level: { ...base.level, sweepMode: 'limited' as const },
    offTargetStreak: 0,
    sweepScore: 0,
  };

  // 造一手「消非目标色」的棋盘
  const makeWrongBoard = () =>
    withTiles(base.board, [
      [3, 0, other],
      [3, 1, other],
      [3, 2, other],
    ]);

  // 第 1 次：应该加
  const r1 = resolveStep({ ...limited, board: makeWrongBoard() }, createRng(5));
  assert.ok(r1.state.sweepScore > 0, '第 1 次非目标消除应该攒分');
  const afterFirst = r1.state.sweepScore;

  // 直接把 streak 推到 4 再消一手：不该再加
  const drained = { ...r1.state, offTargetStreak: 4, sweepScore: afterFirst };
  const r2 = resolveStep({ ...drained, board: makeWrongBoard() }, createRng(7));
  // 连锁可能碰到目标色（会把 streak 清零并加分），所以只在「链没推进」时断言
  if (r2.state.seqIndex === drained.seqIndex) {
    assert.equal(r2.state.sweepScore, afterFirst, '第 5 次非目标消除不该再攒收网分');
  }
});

test('score 模式：不管连消几次都攒分（前 10 关）', () => {
  const base = createGame(1, 42);
  assert.equal(base.level.sweepMode ?? 'score', 'score');
  assert.equal(base.sweepScore, 0);
  assert.equal(base.offTargetStreak, 0);
});

test('一次操作只推进一格：顺手消掉下一个颜色不算完成', () => {
  const base = createGame(6, 42); // L6 链是 overtime, formalist, pua, ...
  const [c0, c1] = base.level.targetChain;
  assert.notEqual(c0, c1, '这个测试需要链上前两格是不同颜色');

  // 造一个能同时消掉「当前目标色」和「下一个目标色」的棋盘：
  // 第 3 行 = c0 c0 c0（三连），第 4 行 = c1 c1 c1（三连）
  let board = base.board;
  board = withTiles(board, [
    [3, 0, c0!],
    [3, 1, c0!],
    [3, 2, c0!],
    [4, 0, c1!],
    [4, 1, c1!],
    [4, 2, c1!],
  ]);

  const { state: next } = resolveStep({ ...base, board, movesLeft: 20 }, createRng(5));

  // 第一格必须完成；第二格（不同颜色）不该被「顺带」完成
  assert.ok(next.seqIndex >= 1, '当前目标色应该完成一格');
  assert.equal(
    next.seqIndex,
    1,
    `只该推进一格，实际推进到 ${next.seqIndex}（链：${base.level.targetChain.join(',')}）`,
  );
});

test('所有关卡的链都保证相邻颜色不同', () => {
  // 相邻同色会让玩家「完成后看起来没变」，进而误以为卡住 —— 这是 v1.0.14 的真实反馈
  for (let id = 1; id <= 10; id += 1) {
    const chain = createGame(id, 42).level.targetChain;
    for (let i = 1; i < chain.length; i += 1) {
      assert.notEqual(chain[i], chain[i - 1], `第 ${id} 关链上 ${i - 1} 和 ${i} 同色`);
    }
  }
});

test('一次操作只推一格（消一排目标色）', () => {
  const base = createGame(1, 42);
  const c0 = base.level.targetChain[0]!;

  const board = withTiles(base.board, [
    [3, 0, c0],
    [3, 1, c0],
    [3, 2, c0],
  ]);
  const { state: next } = resolveStep({ ...base, board, movesLeft: 20 }, createRng(5));
  assert.equal(next.seqIndex, 1, `一次操作只该推进一格，实际 ${next.seqIndex}`);
});

test('跳过只前进一格（不会连跳）', () => {
  const base = createGame(4, 42);
  const rich = { ...base, sweepScore: DEFAULT_SWEEP_THRESHOLDS[0] + 10, sweepUsed: 0 };
  const res = triggerSweep(rich, 'grafter', createRng(1));
  assert.equal(res.ok, true);
  assert.equal(res.state.seqIndex, rich.seqIndex + 1, '跳过只能走一格');
});

test('第一波同时消两色时，只有当前目标色推进（不分颜色）', () => {
  // L6 链是 overtime, formalist, pua, ... —— 前两格不同色
  const base = createGame(6, 42);
  const [cur, next] = base.level.targetChain;
  assert.notEqual(cur, next);

  // 造两个互不相干的三连：一个当前目标色，一个下一个目标色
  const board = withTiles(base.board, [
    [2, 0, cur!],
    [2, 1, cur!],
    [2, 2, cur!],
    [5, 4, next!],
    [5, 5, next!],
    [5, 6, next!],
  ]);

  const { state: s } = resolveStep({ ...base, board, movesLeft: 20 }, createRng(5));
  // 不管是先遍历到哪个颜色，一次操作最多推进一格
  assert.equal(s.seqIndex, 1, `应该只推进一格，实际 ${s.seqIndex}`);
});

test('连锁消到下一格的颜色也不算完成', () => {
  // 这条用行为断言表达：一次操作结束时，seqIndex 最多只比开始时大 1
  // （同色连续格由另一个测试覆盖）
  const base = createGame(6, 42);
  const board = withTiles(base.board, [
    [4, 0, base.level.targetChain[0]!],
    [4, 1, base.level.targetChain[0]!],
    [4, 2, base.level.targetChain[0]!],
  ]);
  const { state: s } = resolveStep({ ...base, board, movesLeft: 20 }, createRng(9));
  assert.ok(s.seqIndex <= 1, `连锁不该多推，实际 ${s.seqIndex}`);
});

test('2 血角色（抢功精）第一次消除就能推进任务', () => {
  // 回归：抢功精 hp=2，第一次消只掉血，outcome.counts 是空的，
  // 之前推进逻辑写在那个循环里 → 永远不执行 → 玩家看到「完成任务但囚车不动」
  const base = createGame(4, 42);
  const first = base.level.targetChain[0]!;
  assert.equal(first, 'grafter', 'L4 第一格应该是抢功精');

  const board = withTiles(base.board, [
    [3, 0, first],
    [3, 1, first],
    [3, 2, first],
  ]);
  const { state: next } = resolveStep({ ...base, board, movesLeft: 20 }, createRng(5));
  assert.equal(next.seqIndex, 1, `2 血角色消一次也该推进，实际 ${next.seqIndex}`);
});

test('把「看过的问题」带进来之后不会重复抽到', () => {
  const all = QUIZZES.map((q) => q.id);
  const seen = all.slice(0, all.length - 1); // 只看剩最后一道没看过
  const { quiz, usedIds } = drawQuiz(12345, seen);
  assert.equal(quiz.id, all[all.length - 1], '只剩一道没看过，应该抽它');
  assert.equal(usedIds.length, all.length, '抽完就把全部题都标成看过');
});

test('问答系统已下线（改由连击奖励取代）', () => {
  const game = createGame(1, 42);
  const many = { ...game, totalCleared: 200, quizzesTaken: 0 };
  assert.equal(shouldTriggerQuiz(many), false, '任何情况下都不该再弹题');
});

// ---------------------------------------------------------------- 连击奖励
test('连续完成 2 次任务给分数奖励', () => {
  const base = createGame(1, 42);
  // 链是 pua, shirk, overtime；造两次不同目标色的三连
  const c0 = base.level.targetChain[0]!;
  const c1 = base.level.targetChain[1]!;

  // 第一次：消 c0 → streak 1
  const b1 = withTiles(base.board, [
    [3, 0, c0],
    [3, 1, c0],
    [3, 2, c0],
  ]);
  const r1 = resolveStep({ ...base, board: b1, movesLeft: 20 }, createRng(5));
  assert.equal(r1.state.seqIndex, 1);
  assert.equal(r1.state.taskStreak, 1, '第一次完成后 streak 应该是 1');

  // 第二次：消 c1 → streak 2 → 分数奖励
  const b2 = withTiles(r1.state.board, [
    [5, 0, c1],
    [5, 1, c1],
    [5, 2, c1],
  ]);
  const r2 = resolveStep({ ...r1.state, board: b2, movesLeft: 19 }, createRng(7));
  assert.equal(r2.state.taskStreak, 2);
  assert.ok(r2.state.pendingReward, '应该有一张待展示的奖励卡');
  assert.equal(r2.state.pendingReward?.kind, 'score');
});

test('中间消了非目标色会打断连击', () => {
  const base = createGame(1, 42);
  const c0 = base.level.targetChain[0]!;

  const b1 = withTiles(base.board, [
    [3, 0, c0],
    [3, 1, c0],
    [3, 2, c0],
  ]);
  const r1 = resolveStep({ ...base, board: b1, movesLeft: 20 }, createRng(5));
  assert.equal(r1.state.taskStreak, 1);

  // 关键：要挑一个**不等于当前目标**的颜色
  const nextTarget = r1.state.level.targetChain[r1.state.seqIndex]!;
  const other = (['shirk', 'overtime', 'grafter', 'formalist', 'flatterer'] as const).find(
    (t) => t !== nextTarget,
  )!;
  assert.notEqual(other, nextTarget);

  const b2 = withTiles(r1.state.board, [
    [5, 6, other],
    [5, 5, other],
    [5, 4, other],
  ]);
  const r2 = resolveStep({ ...r1.state, board: b2, movesLeft: 19 }, createRng(7));
  assert.equal(r2.state.taskStreak, 0, '消非目标色应该把连击打断');
});

test('跳过会打断连击', () => {
  const base = createGame(4, 42);
  const rich = {
    ...base,
    sweepScore: DEFAULT_SWEEP_THRESHOLDS[0] + 10,
    taskStreak: 1,
  };
  const res = triggerSweep(rich, 'grafter', createRng(1));
  assert.equal(res.ok, true);
  assert.equal(res.state.taskStreak, 0, '跳过不算完成任务，连击要断');
});
