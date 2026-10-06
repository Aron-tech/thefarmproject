import {
  ENTITY_TYPES,
  GROUND_TYPES,
  ITEM_TYPES,
  UNLOCK_IDS,
  type Cell,
  type GameState,
  type Inventory,
  type Plant,
  type UnlockLevels,
} from './types.ts';
import { createWorkspace, fileNameProblem, folderNameProblem, MAIN_FILE_ID, type CodeFile, type Workspace } from './codeFiles.ts';
import { EXPAND_WORLD_SIZES, maxUnlockLevel } from './unlocks.ts';

/**
 * Version 2 added unlocks and power (drone speed is no longer stored: it follows from the game state).
 * Version 3 replaced the single program with code files and folders.
 */
export const SAVE_VERSION = 3;
export const MAX_WORLD_SIZE = 32;

export interface SaveData {
  version: typeof SAVE_VERSION;
  savedAt: string;
  workspace: Workspace;
  game: GameState;
}

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

export function createSaveData(game: GameState, workspace: Workspace): SaveData {
  return { version: SAVE_VERSION, savedAt: new Date().toISOString(), workspace, game };
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
  const plant: Plant = {
    type: readEnum(entity.type, ENTITY_TYPES, `${path}.entity.type`),
    plantedAt: readNumber(entity.plantedAt, `${path}.entity.plantedAt`, { min: 0 }),
    growTicks: readNumber(entity.growTicks, `${path}.entity.growTicks`, { min: 0 }),
  };
  if (entity.petals !== undefined) plant.petals = readNumber(entity.petals, `${path}.entity.petals`, { integer: true, min: 0 });
  return { ground, entity: plant };
}

function readInventory(value: unknown): Inventory {
  const raw = readObject(value, 'game.inventory');
  const inventory = {} as Inventory;
  for (const item of ITEM_TYPES) {
    inventory[item] = raw[item] === undefined ? 0 : readNumber(raw[item], `game.inventory.${item}`, { integer: true, min: 0 });
  }
  return inventory;
}

function readUnlocks(value: unknown): UnlockLevels {
  const raw = readObject(value, 'game.unlocks');
  const unlocks = {} as UnlockLevels;
  for (const id of UNLOCK_IDS) {
    unlocks[id] = raw[id] === undefined ? 0 : readNumber(raw[id], `game.unlocks.${id}`, { integer: true, min: 0, max: maxUnlockLevel(id) });
  }
  return unlocks;
}

/**
 * Version 1 saves come from before the unlock tree, when every function was available: unlock what
 * existed back then so old programs keep running, with the Expand level matching the saved farm.
 */
function legacyUnlocks(worldSize: number): UnlockLevels {
  const unlocks = {} as UnlockLevels;
  for (const id of UNLOCK_IDS) unlocks[id] = 1;
  unlocks.Speed = 0;
  unlocks.Sunflowers = 0;
  const expandLevel = EXPAND_WORLD_SIZES.findIndex((size) => size >= worldSize);
  unlocks.Expand = expandLevel === -1 ? maxUnlockLevel('Expand') : Math.max(1, expandLevel);
  return unlocks;
}

function readGameState(value: unknown, version: number): GameState {
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
    unlocks: version === 1 ? legacyUnlocks(worldSize) : readUnlocks(game.unlocks),
    poweredActions: version === 1 ? 0 : readNumber(game.poweredActions, 'game.poweredActions', { integer: true, min: 0 }),
    tick: readNumber(game.tick, 'game.tick', { min: 0 }),
    rngState: readNumber(game.rngState, 'game.rngState', { integer: true }),
  };
}

function readWorkspace(value: unknown): Workspace {
  const raw = readObject(value, 'workspace');
  if (!Array.isArray(raw.folders)) fail('workspace.folders', 'an array');
  let workspace: Workspace = { files: [], folders: [] };
  raw.folders.forEach((folder, i) => {
    if (typeof folder !== 'string' || folderNameProblem(workspace, folder) !== null) fail(`workspace.folders[${i}]`, 'a unique folder name');
    workspace = { ...workspace, folders: [...workspace.folders, folder] };
  });
  if (!Array.isArray(raw.files)) fail('workspace.files', 'an array');
  const files: CodeFile[] = [];
  const ids = new Set<string>();
  raw.files.forEach((value, i) => {
    const path = `workspace.files[${i}]`;
    const file = readObject(value, path);
    if (typeof file.id !== 'string' || file.id === '' || ids.has(file.id)) fail(`${path}.id`, 'a unique id');
    if (typeof file.name !== 'string' || fileNameProblem({ ...workspace, files }, file.name) !== null) fail(`${path}.name`, 'a unique file name');
    if (typeof file.code !== 'string') fail(`${path}.code`, 'a string');
    const folder = typeof file.folder === 'string' && workspace.folders.includes(file.folder) ? file.folder : null;
    const breakpoints = Array.isArray(file.breakpoints) ? file.breakpoints.filter((line): line is number => Number.isInteger(line) && line > 0) : [];
    ids.add(file.id);
    files.push({ id: file.id, name: file.name, code: file.code, folder, open: file.open !== false, minimized: file.minimized === true, breakpoints });
  });
  if (!ids.has(MAIN_FILE_ID)) fail('workspace.files', 'a list containing the main file');
  return { ...workspace, files };
}

/** Validates untrusted save data (from storage or an imported file). Throws SaveFormatError when invalid. */
export function parseSaveData(value: unknown): SaveData {
  const data = readObject(value, 'save');
  if (data.version !== SAVE_VERSION && data.version !== 1 && data.version !== 2) {
    throw new SaveFormatError(`Unsupported save version: ${String(data.version)} (expected ${SAVE_VERSION})`);
  }
  let workspace: Workspace;
  if (data.version === SAVE_VERSION) {
    workspace = readWorkspace(data.workspace);
  } else {
    // Older saves had a single program, which becomes the main file.
    if (typeof data.code !== 'string') fail('code', 'a string');
    workspace = createWorkspace(data.code);
  }
  return {
    version: SAVE_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date(0).toISOString(),
    workspace,
    game: readGameState(data.game, data.version),
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
