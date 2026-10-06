import { CELLS_PER_RUIN, MINE_LAYER_DEFS, RUIN_MAX_SIZE, RUIN_MIN_SIZE, type MineLayerDef } from './constants.ts';
import { createPlant } from './crops.ts';
import { stepPos, wrapCoord } from './grid.ts';
import { nextRandom } from './random.ts';
import { PLANAR_DIRECTIONS, type BlockType, type Direction, type GridPos, type MineCell, type MineState } from './types.ts';

/** A cell of the mine: a position on a layer (depth ≥ 1). */
export interface MinePos {
  pos: GridPos;
  depth: number;
}

export function mineIndex(pos: GridPos, depth: number, size: number): number {
  return (depth - 1) * size * size + pos.y * size + pos.x;
}

export function getMineCell(mine: MineState, pos: GridPos, depth: number, size: number): MineCell {
  const cell = mine.cells[mineIndex(pos, depth, size)];
  if (!cell) throw new RangeError(`No mine cell at (${pos.x}, ${pos.y}) on layer ${depth}`);
  return cell;
}

/** Generation rules of a layer; layers below the table repeat its last entry. */
export function getLayerDef(depth: number): MineLayerDef {
  return MINE_LAYER_DEFS[Math.min(depth, MINE_LAYER_DEFS.length) - 1]!;
}

export function isMinefield(depth: number): boolean {
  return (getLayerDef(depth).mines ?? 0) > 0;
}

/**
 * The cell next to a position in a direction. Directions on a layer wrap around like the farm;
 * Up from layer 1 is the farm (depth 0); Down from the farm is layer 1. Null when there is nothing there.
 */
export function neighborOf(pos: GridPos, depth: number, direction: Direction, size: number, layers: number): MinePos | null {
  if (direction === 'Up') return depth > 0 ? { pos, depth: depth - 1 } : null;
  if (direction === 'Down') return depth < layers ? { pos, depth: depth + 1 } : null;
  return { pos: stepPos(pos, direction, size), depth };
}

function pickWeighted(weights: Partial<Record<BlockType, number>>, roll: number): BlockType {
  const entries = Object.entries(weights) as [BlockType, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let left = roll * total;
  for (const [block, weight] of entries) {
    left -= weight;
    if (left < 0) return block;
  }
  return entries.at(-1)![0];
}

/** Cells around (0, 0) of a minefield never hold mines, so there is a safe place to start. */
function isInSafeZone(x: number, y: number, size: number): boolean {
  if (size < 5) return x === 0 && y === 0;
  const dx = Math.min(x, size - x);
  const dy = Math.min(y, size - y);
  return dx <= 1 && dy <= 1;
}

/** Generates the cells of one layer from its definition. */
export function generateLayer(size: number, depth: number, tick: number, rngState: number): [MineCell[], number] {
  const def = getLayerDef(depth);
  const cells: MineCell[] = [];
  let rng = rngState;
  const roll = (): number => {
    const [value, next] = nextRandom(rng);
    rng = next;
    return value;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (def.caves && roll() < def.caves) {
        const [mushroom, next] = createPlant('Mushroom', tick - 1_000_000, rng);
        rng = next;
        cells.push({ block: 'Air', damage: 0, entity: mushroom });
        continue;
      }
      const cell: MineCell = { block: pickWeighted(def.weights, roll()), damage: 0, entity: null };
      if (def.mines && roll() < def.mines && !isInSafeZone(x, y, size)) {
        cells.push({ block: 'Stone', damage: 0, entity: null, mine: true });
        continue;
      }
      cells.push(cell);
    }
  }
  if (def.ruins) rng = placeRuins(cells, size, depth, rng);
  return [cells, rng];
}

/** Grows ruins as random clusters of neighbouring cells. Ruin ids are unique across the mine. */
function placeRuins(cells: MineCell[], size: number, depth: number, rngState: number): number {
  let rng = rngState;
  const roll = (): number => {
    const [value, next] = nextRandom(rng);
    rng = next;
    return value;
  };
  const count = Math.max(1, Math.floor((size * size) / CELLS_PER_RUIN));
  const maxSize = Math.min(RUIN_MAX_SIZE, Math.floor((size * size) / 3));
  if (maxSize < RUIN_MIN_SIZE) return rng;
  for (let r = 0; r < count; r++) {
    const ruinId = depth * 1000 + r;
    const target = RUIN_MIN_SIZE + Math.floor(roll() * (maxSize - RUIN_MIN_SIZE + 1));
    const start = Math.floor(roll() * cells.length);
    if (cells[start]!.ruin !== undefined) continue;
    const members = [start];
    while (members.length < target) {
      const frontier: number[] = [];
      for (const index of members) {
        const pos = { x: index % size, y: Math.floor(index / size) };
        for (const direction of PLANAR_DIRECTIONS) {
          const next = stepPos(pos, direction, size);
          const nextIndex = next.y * size + next.x;
          if (cells[nextIndex]!.ruin === undefined && !members.includes(nextIndex)) frontier.push(nextIndex);
        }
      }
      if (frontier.length === 0) break;
      members.push(frontier[Math.floor(roll() * frontier.length)]!);
    }
    for (const index of members) cells[index] = { block: 'Ruin', damage: 0, entity: null, ruin: ruinId };
  }
  return rng;
}

export function createMine(size: number, layers: number, tick: number, rngState: number): [MineState, number] {
  return addMineLayers({ layers: 0, cells: [] }, size, layers, tick, rngState);
}

/** Adds freshly generated layers below the existing ones. */
export function addMineLayers(mine: MineState, size: number, layers: number, tick: number, rngState: number): [MineState, number] {
  if (layers <= mine.layers) return [mine, rngState];
  const cells = mine.cells.slice();
  let rng = rngState;
  for (let depth = mine.layers + 1; depth <= layers; depth++) {
    const [layer, next] = generateLayer(size, depth, tick, rng);
    rng = next;
    cells.push(...layer);
  }
  return [{ layers, cells }, rng];
}

/** Replaces one layer with a freshly generated one. */
export function regenerateLayer(mine: MineState, size: number, depth: number, tick: number, rngState: number): [MineState, number] {
  const [layer, rng] = generateLayer(size, depth, tick, rngState);
  const cells = mine.cells.slice();
  cells.splice((depth - 1) * size * size, size * size, ...layer);
  return [{ ...mine, cells }, rng];
}

/** Resizes every layer, keeping cells at their coordinates and generating the new ones. */
export function resizeMine(mine: MineState, oldSize: number, size: number, tick: number, rngState: number): [MineState, number] {
  if (size === oldSize) return [mine, rngState];
  const cells: MineCell[] = [];
  let rng = rngState;
  for (let depth = 1; depth <= mine.layers; depth++) {
    const [fresh, next] = generateLayer(size, depth, tick, rng);
    rng = next;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const keep = x < oldSize && y < oldSize;
        cells.push(keep ? mine.cells[mineIndex({ x, y }, depth, oldSize)]! : fresh[y * size + x]!);
      }
    }
  }
  return [{ ...mine, cells }, rng];
}

/** Mines in the eight cells around a position on its layer. */
export function countAdjacentMines(mine: MineState, pos: GridPos, depth: number, size: number): number {
  let count = 0;
  const seen = new Set<number>();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const other = { x: wrapCoord(pos.x + dx, size), y: wrapCoord(pos.y + dy, size) };
      const index = mineIndex(other, depth, size);
      if (seen.has(index) || (other.x === pos.x && other.y === pos.y)) continue;
      seen.add(index);
      if (mine.cells[index]!.mine) count++;
    }
  }
  return count;
}

/** Indices of the blocks of a ruin; ruins never span layers. */
export function ruinIndices(mine: MineState, ruinId: number, depth: number, size: number): number[] {
  const start = (depth - 1) * size * size;
  const indices: number[] = [];
  for (let i = start; i < start + size * size; i++) {
    if (mine.cells[i]!.ruin === ruinId) indices.push(i);
  }
  return indices;
}

/** Position and depth of a mine cell index. */
export function minePosOf(index: number, size: number): MinePos {
  const area = size * size;
  const within = index % area;
  return { pos: { x: within % size, y: Math.floor(within / size) }, depth: Math.floor(index / area) + 1 };
}

/** A ruin is excavated once every block next to it (on its layer, above and below) is dug out. */
export function isRuinExposed(mine: MineState, ruinId: number, depth: number, size: number): boolean {
  for (const index of ruinIndices(mine, ruinId, depth, size)) {
    const { pos } = minePosOf(index, size);
    for (const direction of ['North', 'East', 'South', 'West', 'Up', 'Down'] as const) {
      const next = neighborOf(pos, depth, direction, size, mine.layers);
      if (!next || next.depth === 0) continue;
      const cell = getMineCell(mine, next.pos, next.depth, size);
      if (cell.block !== 'Air' && cell.ruin !== ruinId) return false;
    }
  }
  return true;
}

/** Ids of the ruins next to (or at) a mine position. */
export function ruinsAround(mine: MineState, pos: GridPos, depth: number, size: number): number[] {
  const ids = new Set<number>();
  for (const direction of ['North', 'East', 'South', 'West', 'Up', 'Down'] as const) {
    const next = neighborOf(pos, depth, direction, size, mine.layers);
    if (!next || next.depth === 0) continue;
    const ruin = getMineCell(mine, next.pos, next.depth, size).ruin;
    if (ruin !== undefined) ids.add(ruin);
  }
  return [...ids];
}

/**
 * The ripe mushrooms connected to a cell on its layer (4-neighbours, no wrapping), and whether the group
 * is sorted: colours never decrease towards East and North.
 */
export function mushroomGroup(
  mine: MineState,
  pos: GridPos,
  depth: number,
  size: number,
  isRipe: (cell: MineCell) => boolean,
): { indices: number[]; sorted: boolean } {
  const startIndex = mineIndex(pos, depth, size);
  const indices = [startIndex];
  const seen = new Set(indices);
  let sorted = true;
  for (let i = 0; i < indices.length; i++) {
    const { pos: current } = minePosOf(indices[i]!, size);
    const color = mine.cells[indices[i]!]!.entity?.color ?? 0;
    const neighbors: [number, number, 1 | -1][] = [
      [current.x + 1, current.y, 1],
      [current.x - 1, current.y, -1],
      [current.x, current.y + 1, 1],
      [current.x, current.y - 1, -1],
    ];
    for (const [x, y, sign] of neighbors) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const index = mineIndex({ x, y }, depth, size);
      const cell = mine.cells[index]!;
      if (cell.entity?.type !== 'Mushroom' || !isRipe(cell)) continue;
      if (sign * ((cell.entity.color ?? 0) - color) < 0) sorted = false;
      if (!seen.has(index)) {
        seen.add(index);
        indices.push(index);
      }
    }
  }
  return { indices, sorted };
}
