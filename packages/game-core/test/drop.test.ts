/**
 * 掉落式消消乐 单测
 *
 * 重点验证：
 *   1. 下落组能左右移动，撞边界不动
 *   2. 落地后写入棋盘、检查三连
 *   3. 三连消除 + 重力 + 连锁
 *   4. 堆到顶 = 死
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDropGravity,
  columnHeights,
  createDropGame,
  dropProgress,
  findDropMatches,
  ghostRow,
  hardDrop,
  moveGroup,
  tickDrop,
  type DropState,
  type DropTile,
} from '../src/drop.ts';
import type { VillainType } from '../src/types.ts';

const CONFIG = {
  cols: 7,
  rows: 11,
  types: ['pua', 'shirk', 'overtime'] as VillainType[],
  target: 30,
};

function makeTile(type: VillainType, id = 1): DropTile {
  return { type, id };
}

test('开局有下落组、底部有预填', () => {
  const state = createDropGame(CONFIG, 42);
  assert.equal(state.status, 'playing');
  assert.ok(state.falling, '应该有下落组');
  assert.equal(state.falling!.tiles.length, 1);

  // 底部 2 行应该有预填（让玩家一上来就有东西可堆）
  const bottom = state.board[CONFIG.rows - 1]!;
  assert.ok(bottom.every((c) => c !== null), '最底行应该铺满');
  // 上半部分应该是空的
  assert.ok(state.board[0]!.every((c) => c === null), '顶部应该空');
});

test('单牌掉落：每次只落一个', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const state = createDropGame(CONFIG, seed);
    assert.equal(state.falling!.tiles.length, 1, '单牌模式应该只有 1 个');
  }
});

test('左右移动成功', () => {
  const state = createDropGame(CONFIG, 42);
  const startCol = state.falling!.col;
  const { state: next, ok } = moveGroup(state, -1);
  assert.equal(ok, true);
  assert.equal(next.falling!.col, startCol - 1);
});

test('撞到左边界不动', () => {
  const state = createDropGame(CONFIG, 42);
  const atWall = { ...state, falling: { ...state.falling!, col: 0 } };
  const { state: next, ok } = moveGroup(atWall, -1);
  assert.equal(ok, false);
  assert.equal(next.falling!.col, 0);
});

test('撞到右边界不动', () => {
  const state = createDropGame(CONFIG, 42);
  // 单牌模式，最右能放的位置是 cols - 1
  const atWall = { ...state, falling: { ...state.falling!, col: CONFIG.cols - 1 } };
  const { state: next, ok } = moveGroup(atWall, 1);
  assert.equal(ok, false);
  assert.equal(next.falling!.col, CONFIG.cols - 1);
});

test('tickDrop 会往下走一格', () => {
  const state = createDropGame(CONFIG, 42);
  const { state: next } = tickDrop(state);
  assert.equal(next.falling!.row, state.falling!.row + 1);
});

test('hardDrop 直接落到底部', () => {
  const state = createDropGame(CONFIG, 42);
  const { state: next } = hardDrop(state);
  // 落到底后应该结算：原来的组已经写进棋盘了，新组在上面
  assert.equal(next.falling!.row, 0);
  // 落下的牌要么在棋盘上，要么被消除了（一组 3 个同色会立即消掉）
  const anyTile = next.board.some((row) => row.some((c) => c !== null));
  assert.ok(anyTile || next.cleared > 0, '应该落地或消除');
});

test('横向三连会被识别', () => {
  const board: Array<Array<DropTile | null>> = Array.from({ length: 3 }, () =>
    Array<DropTile | null>(3).fill(null),
  );
  board[2]![0] = makeTile('pua', 1);
  board[2]![1] = makeTile('pua', 2);
  board[2]![2] = makeTile('pua', 3);

  const matches = findDropMatches(board, 3, 3);
  assert.equal(matches.length, 3);
});

test('纵向三连会被识别', () => {
  const board: Array<Array<DropTile | null>> = Array.from({ length: 3 }, () =>
    Array<DropTile | null>(3).fill(null),
  );
  board[0]![1] = makeTile('shirk', 1);
  board[1]![1] = makeTile('shirk', 2);
  board[2]![1] = makeTile('shirk', 3);

  const matches = findDropMatches(board, 3, 3);
  assert.equal(matches.length, 3);
});

test('重力把牌压到底部', () => {
  const board: Array<Array<DropTile | null>> = Array.from({ length: 5 }, () =>
    Array<DropTile | null>(2).fill(null),
  );
  board[1]![0] = makeTile('pua', 1);
  board[3]![0] = makeTile('shirk', 2);

  applyDropGravity(board, 2, 5);
  assert.equal(board[4]![0]?.type, 'shirk');
  assert.equal(board[3]![0]?.type, 'pua');
  assert.equal(board[0]![0], null);
});

test('落地形成三连会消除并加分', () => {
  const state = createDropGame(CONFIG, 7);
  // 构造纵向三连：底部和倒数第二行都是 pua，落下来的第一个也是 pua
  const board = state.board.map((row) => [...row]);
  board[CONFIG.rows - 1]![0] = makeTile('pua', 9001);
  board[CONFIG.rows - 2]![0] = makeTile('pua', 9002);

  const custom: DropState = {
    ...state,
    board,
    falling: {
      col: 0,
      row: 0,
      tiles: [makeTile('pua', 1), makeTile('pua', 2), makeTile('shirk', 3)],
    },
  };

  const { state: next, result } = hardDrop(custom);
  assert.equal(result.ok, true);
  assert.ok(next.cleared > 0, `应该消除了一些：${next.cleared}`);
  assert.ok(next.score > 0);
});

test('消除后上方牌会掉下来', () => {
  const board: Array<Array<DropTile | null>> = Array.from({ length: 5 }, () =>
    Array<DropTile | null>(3).fill(null),
  );
  // 底部三连
  board[4]![0] = makeTile('pua', 1);
  board[4]![1] = makeTile('pua', 2);
  board[4]![2] = makeTile('pua', 3);
  // 上面压着一张
  board[2]![1] = makeTile('shirk', 4);

  const matches = findDropMatches(board, 3, 5);
  assert.equal(matches.length, 3);
  for (const m of matches) board[m.row]![m.col] = null;
  applyDropGravity(board, 3, 5);

  // shirk 应该掉到最底
  assert.equal(board[4]![1]?.type, 'shirk');
});

test('堆到顶 = 死', () => {
  const state = createDropGame(CONFIG, 42);
  // 把整个棋盘填满（用交替颜色避免触发三连消除），这样新组无处可放
  const board: Array<Array<DropTile | null>> = state.board.map((row, r) =>
    row.map((_, c) =>
      (r + c) % 2 === 0 ? makeTile('shirk', 8000 + r * 100 + c) : makeTile('overtime', 9000 + r * 100 + c),
    ),
  );

  const custom: DropState = { ...state, board };
  const { state: next } = hardDrop(custom);
  assert.equal(next.status, 'lost');
  assert.ok(next.endReason?.includes('堆到顶'));
  // 而且不该把已有牌覆盖掉
  assert.ok(next.board[0]!.every((c) => c !== null), '原有的牌不该被覆盖');
});

test('达成目标 = 通关', () => {
  const state = createDropGame({ ...CONFIG, target: 1 }, 42);
  // 清空预填再手工构造，保证只有我们要的那两张牌
  const board: Array<Array<DropTile | null>> = state.board.map((row) => row.map(() => null));
  board[CONFIG.rows - 1]![0] = makeTile('pua', 9001);
  board[CONFIG.rows - 2]![0] = makeTile('pua', 9002);

  const custom: DropState = {
    ...state,
    board,
    target: 1,
    falling: {
      col: 0,
      row: 0,
      tiles: [makeTile('pua', 1), makeTile('pua', 2), makeTile('shirk', 3)],
    },
  };
  const { state: next } = hardDrop(custom);
  assert.equal(next.status, 'won');
});

test('ghostRow 显示落点', () => {
  const state = createDropGame(CONFIG, 42);
  const ghost = ghostRow(state);
  assert.ok(ghost !== null);
  // 有预填时，落点应该在预填上方，不会穿过已有牌
  assert.ok(ghost < CONFIG.rows - 1, '应该停在预填层上方');
  assert.ok(ghost >= 0);
});

test('列高度统计正确', () => {
  const state = createDropGame(CONFIG, 42);
  // 清空后手工构造，避免预填干扰
  const board: Array<Array<DropTile | null>> = state.board.map((row) => row.map(() => null));
  board[CONFIG.rows - 1]![2] = makeTile('pua', 1);
  board[CONFIG.rows - 2]![2] = makeTile('pua', 2);
  const custom = { ...state, board };
  const heights = columnHeights(custom);
  assert.equal(heights[2], 2);
  assert.equal(heights[0], 0);
});

test('进度统计正确', () => {
  const state = createDropGame(CONFIG, 42);
  const p = dropProgress({ ...state, cleared: 12 });
  assert.equal(p.current, 12);
  assert.equal(p.total, CONFIG.target);
});

test('同种子生成同一组牌', () => {
  const a = createDropGame(CONFIG, 555);
  const b = createDropGame(CONFIG, 555);
  assert.deepEqual(
    a.falling!.tiles.map((t) => t.type),
    b.falling!.tiles.map((t) => t.type),
  );
});
