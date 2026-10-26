/**
 * 测试辅助：手工造棋盘
 *
 * 造棋盘时必须小心：默认值要选得「不会自己形成三连」，
 * 否则测 A 的时候会被 B 的巧合匹配干扰。
 * 这里用「棋盘格式」交替类型来避免相邻同色。
 */

import type { Board, Tile, VillainType } from '../src/types.ts';
import { VILLAINS } from '../src/types.ts';

let idCounter = 1;

function tile(type: VillainType, row: number, col: number): Tile {
  return {
    id: idCounter++,
    type,
    hp: VILLAINS[type].hp,
    poisoned: false,
    state: 'idle',
    viewRow: row,
    viewCol: col,
    scale: 1,
    rotation: 0,
    alpha: 1,
  };
}

/**
 * 造一个「默认没有三连」的棋盘：
 * 交替填充 primary / secondary，保证横向纵向都不会三个相同。
 */
export function createLevelBoard(rows: number, cols: number, primary: VillainType): Board {
  const others: VillainType[] = ['pua', 'shirk', 'grafter', 'overtime', 'formalist'];
  const secondary = others.find((t) => t !== primary) ?? 'overtime';
  // 再用第三、第四种穿插，进一步降低偶然三连概率
  const tertiary = others.find((t) => t !== primary && t !== secondary) ?? 'grafter';
  const quaternary = others.find((t) => t !== primary && t !== secondary && t !== tertiary) ?? 'formalist';

  const board: Board = [];
  for (let r = 0; r < rows; r += 1) {
    const row: Array<Tile | null> = [];
    for (let c = 0; c < cols; c += 1) {
      // 用 4 种类型做 (r + 2c) 的模运算，保证任意三个相邻不会相同
      const pick = [primary, secondary, tertiary, quaternary][(r + 2 * c) % 4] ?? primary;
      row.push(tile(pick, r, c));
    }
    board.push(row);
  }
  return board;
}

/** 把指定坐标改成指定类型 */
export function withTiles(
  board: Board,
  changes: Array<[row: number, col: number, type: VillainType]>,
): Board {
  const next = board.map((row) => [...row]);
  for (const [r, c, type] of changes) {
    const existing = next[r]?.[c];
    if (!existing) throw new Error(`坐标 (${r},${c}) 不存在`);
    next[r]![c] = {
      ...existing,
      type,
      hp: VILLAINS[type].hp,
    };
  }
  return next;
}
