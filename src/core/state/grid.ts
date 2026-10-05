import type { Cell, Direction, GridPos } from './types.ts';

/** Wraps a coordinate onto the torus-shaped farm. */
export function wrapCoord(value: number, worldSize: number): number {
  return ((value % worldSize) + worldSize) % worldSize;
}

export function cellIndex(pos: GridPos, worldSize: number): number {
  return pos.y * worldSize + pos.x;
}

export function getCell(cells: readonly Cell[], pos: GridPos, worldSize: number): Cell {
  const cell = cells[cellIndex(pos, worldSize)];
  if (!cell) {
    throw new RangeError(`No cell at (${pos.x}, ${pos.y}) in a ${worldSize}x${worldSize} world`);
  }
  return cell;
}

const DIRECTION_DELTAS: Record<Direction, GridPos> = {
  North: { x: 0, y: 1 },
  East: { x: 1, y: 0 },
  South: { x: 0, y: -1 },
  West: { x: -1, y: 0 },
};

export function stepPos(pos: GridPos, direction: Direction, worldSize: number): GridPos {
  const delta = DIRECTION_DELTAS[direction];
  return {
    x: wrapCoord(pos.x + delta.x, worldSize),
    y: wrapCoord(pos.y + delta.y, worldSize),
  };
}
