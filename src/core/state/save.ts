import { ENTITY_TYPES, GROUND_TYPES, ITEM_TYPES, type Cell, type GameState, type Inventory } from './types.ts';

export const SAVE_VERSION = 1;
export const MAX_WORLD_SIZE = 32;

export interface SaveData {
  version: typeof SAVE_VERSION;
  savedAt: string;
  code: string;
  /** Ops per second, or null for maximum speed. */
  speed: number | null;
  game: GameState;
}

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

export function createSaveData(game: GameState, code: string, speed: number | null): SaveData {
  return { version: SAVE_VERSION, savedAt: new Date().toISOString(), code, speed, game };
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data, null, 2);
}

// ---------------------------------------------------------------- validation

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, expected: string): never {
  throw new SaveFormatError(`Invalid save: ${path} must be ${expected}`);
}

function readObject(value: unknown, path: string): JsonObject {
  if (!isObject(value)) fail(path, 'an object');
  return value;
}

function readNumber(value: unknown, path: string, { integer = false, min = -Infinity, max = Infinity } = {}): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
    fail(path, `a${integer ? 'n integer' : ' number'} between ${min} and ${max}`);
  }
  return value;
}

function readEnum<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) fail(path, `one of ${options.join(', ')}`);
  return value as T;
}

function readCell(value: unknown, path: string): Cell {
  const cell = readObject(value, path);
  const ground = readEnum(cell.ground, GROUND_TYPES, `${path}.ground`);
  if (cell.entity === null) return { ground, entity: null };
  const entity = readObject(cell.entity, `${path}.entity`);
  return {
    ground,
    entity: {
      type: readEnum(entity.type, ENTITY_TYPES, `${path}.entity.type`),
      plantedAt: readNumber(entity.plantedAt, `${path}.entity.plantedAt`, { min: 0 }),
      growTicks: readNumber(entity.growTicks, `${path}.entity.growTicks`, { min: 0 }),
    },
  };
}

function readInventory(value: unknown): Inventory {
  const raw = readObject(value, 'game.inventory');
  const inventory = {} as Inventory;
  for (const item of ITEM_TYPES) {
    inventory[item] = raw[item] === undefined ? 0 : readNumber(raw[item], `game.inventory.${item}`, { integer: true, min: 0 });
  }
  return inventory;
}

function readGameState(value: unknown): GameState {
  const game = readObject(value, 'game');
  const worldSize = readNumber(game.worldSize, 'game.worldSize', { integer: true, min: 1, max: MAX_WORLD_SIZE });
  if (!Array.isArray(game.cells) || game.cells.length !== worldSize * worldSize) {
    fail('game.cells', `an array of ${worldSize * worldSize} cells`);
  }
  const drone = readObject(game.drone, 'game.drone');
  const pos = readObject(drone.pos, 'game.drone.pos');
  const coord = { integer: true, min: 0, max: worldSize - 1 };
  return {
    worldSize,
    cells: game.cells.map((cell, i) => readCell(cell, `game.cells[${i}]`)),
    drone: { pos: { x: readNumber(pos.x, 'game.drone.pos.x', coord), y: readNumber(pos.y, 'game.drone.pos.y', coord) } },
    inventory: readInventory(game.inventory),
    tick: readNumber(game.tick, 'game.tick', { min: 0 }),
    rngState: readNumber(game.rngState, 'game.rngState', { integer: true }),
  };
}

/** Validates untrusted save data (from storage or an imported file). Throws SaveFormatError when invalid. */
export function parseSaveData(value: unknown): SaveData {
  const data = readObject(value, 'save');
  if (data.version !== SAVE_VERSION) {
    throw new SaveFormatError(`Unsupported save version: ${String(data.version)} (expected ${SAVE_VERSION})`);
  }
  if (typeof data.code !== 'string') fail('code', 'a string');
  const speed = data.speed === null ? null : readNumber(data.speed, 'speed', { min: 1 });
  return {
    version: SAVE_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date(0).toISOString(),
    code: data.code,
    speed,
    game: readGameState(data.game),
  };
}

export function parseSaveJson(text: string): SaveData {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SaveFormatError('Invalid save: not a JSON file');
  }
  return parseSaveData(value);
}
