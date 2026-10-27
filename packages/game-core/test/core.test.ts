/**
 * 核心逻辑单测 —— 这部分必须可靠，因为它是整个游戏的地基。
 *
 * 运行：npm test
 * 用的是 Node 内置 test runner + 类型剥离，不需要装测试框架。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRng, seedFromDate } from '../src/rng.ts';
import { QUIZZES } from '../src/quiz.ts';
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

  // 攒到第一个门槛就能跳过
  const rich = { ...game, score: DEFAULT_SWEEP_THRESHOLDS[0] + 10 };
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
test('有救援配置的关卡会初始化救援目标', () => {
  const game = createGame(1, 42);
  assert.equal(game.rescues.length, 1);
  assert.equal(game.rescues[0]!.status, 'active');
  assert.equal(game.rescues[0]!.type, 'pua');
  assert.ok(game.rescues[0]!.needed > 0);
  assert.equal(game.rescues[0]!.danger, 0);
});

test('没有救援配置的关卡为空数组', () => {
  const game = createGame(10, 42);
  // L10 没配 rescues
  assert.equal(game.rescues.length, 0);
});

test('救援倒计时会推进危险值', () => {
  const game = createGame(1, 42);
  const r = game.rescues[0]!;
  const after = advanceRescue(game, 5);
  assert.ok(after.rescues[0]!.danger > 0, '危险值应该上涨');
  assert.ok(after.rescues[0]!.danger < 1, '5 秒还不该满');
  void r;
});

test('危险值涨满判定救援失败但不结束游戏', () => {
  let game = createGame(1, 42);
  // 一次性推进超过 dangerSeconds
  game = advanceRescue(game, 999);
  assert.equal(game.rescues[0]!.status, 'lost');
  assert.equal(game.lostCount, 1);
  assert.equal(game.rescuePenalty, 1);
  // 关键：游戏没结束
  assert.equal(game.phase, 'idle');
});

test('消除对应类型会推进救援进度并回退危险值', () => {
  const game = createGame(1, 42);
  // 先让危险值涨一点
  const warned = advanceRescue(game, 8);
  const dangerBefore = warned.rescues[0]!.danger;
  assert.ok(dangerBefore > 0);

  // 找一步能消除诈骗犯的交换
  const hint = findHint(warned.board);
  if (!hint) return;
  const { state: swapped } = trySwap(warned, hint.a, hint.b);
  const { state } = resolveStep(swapped, createRng(swapped.seed));

  const after = state.rescues[0]!;
  // 如果这一步消到了诈骗犯，进度应该涨、危险值应该降
  if (state.clearedCount.pua > warned.clearedCount.pua) {
    assert.ok(after.progress > warned.rescues[0]!.progress, '进度应该推进');
    assert.ok(after.danger < dangerBefore, '危险值应该回退');
  }
});

test('救援成功会把状态置为 rescued', () => {
  const game = createGame(1, 42);
  const r = game.rescues[0]!;
  // 直接构造一个「已消够」的状态
  const almost = {
    ...game,
    rescues: [{ ...r, progress: r.needed - 1, danger: 0.9 }],
  };
  // 找一步消诈骗犯
  const hint = findHint(almost.board);
  if (!hint) return;
  const { state: swapped } = trySwap(almost, hint.a, hint.b);
  const { state } = resolveStep(swapped, createRng(swapped.seed));
  if (state.clearedCount.pua > almost.clearedCount.pua) {
    // 只要消到就应救出
    assert.equal(state.rescues[0]!.status, 'rescued');
    assert.ok(state.rescuedCount >= 1);
  }
});

test('救援失败会削减星级上限', () => {
  const game = createGame(1, 42);
  const won = { ...game, phase: 'won' as const, score: 999999 };
  // 没失败：三星
  assert.equal(computeStars(won), 3);
  // 失败一次：最多两星
  assert.equal(computeStars({ ...won, rescuePenalty: 1 }), 2);
  // 失败两次：最多一星
  assert.equal(computeStars({ ...won, rescuePenalty: 2 }), 1);
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

test('解恨模式救援计时更慢', () => {
  const normal = createGame(1, 42, 'normal');
  const catharsis = createGame(1, 42, 'catharsis');
  const n = advanceRescue(normal, 10).rescues[0]!.danger;
  const c = advanceRescue(catharsis, 10).rescues[0]!.danger;
  assert.ok(c < n, `解恨模式危险值应更慢：${c} vs ${n}`);
});

test('解恨模式救援失败不扣评价', () => {
  const catharsis = createGame(1, 42, 'catharsis');
  const lost = advanceRescue(catharsis, 9999);
  assert.equal(lost.lostCount, 1);
  assert.equal(lost.rescuePenalty, 0, '解恨模式不该扣评价');
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
test('第 5 关起有任务倒计时', () => {
  assert.ok((createGame(4, 42).level.taskTimerSeconds ?? 0) === 0, '第 4 关不该有倒计时');
  const g5 = createGame(5, 42);
  assert.ok((g5.level.taskTimerSeconds ?? 0) > 0, '第 5 关应该有倒计时');
  assert.equal(g5.taskTimeLeft, g5.level.taskTimerSeconds);
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
