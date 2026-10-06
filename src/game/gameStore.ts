import { createStore, type StoreApi } from 'zustand/vanilla';
import type { VariableSnapshot } from '../core/interpreter/evaluator.ts';
import type { CodeLocation } from '../core/interpreter/protocol.ts';
import { addFile, createWorkspace, MAIN_FILE_ID, type Workspace } from '../core/state/codeFiles.ts';
import type { GameState } from '../core/state/types.ts';

export type RunStatus = 'idle' | 'running' | 'paused';

export interface ConsoleEntry {
  id: number;
  kind: 'print' | 'error' | 'info';
  text: string;
}

export interface RunError {
  message: string;
  /** Where it happened, by file name; null when the error has no position. */
  location: CodeLocation | null;
}

/** A new farm starts with nothing unlocked but harvest(), like the game. */
export const DEFAULT_CODE = `harvest()
`;

export interface GameStoreState {
  game: GameState;
  workspace: Workspace;
  /** The code window used last; F5 / F10 run it. */
  activeFileId: string;
  /** File the current (or last) run was started from. */
  runningFileId: string | null;
  runStatus: RunStatus;
  /** Statement currently executing (or about to, when paused). */
  currentLocation: CodeLocation | null;
  lastError: RunError | null;
  variables: VariableSnapshot | null;
  console: ConsoleEntry[];
  /** Mine layer the view centres on (0 = the farm); null follows the drone. */
  viewDepth: number | null;
}

export type GameStore = StoreApi<GameStoreState>;

export interface InitialStoreData {
  game: GameState;
  workspace?: Workspace;
}

/** Applies one of the pure workspace operations (see codeFiles.ts) to the store. */
export function updateWorkspace(store: GameStore, update: (workspace: Workspace) => Workspace): void {
  const current = store.getState().workspace;
  const next = update(current);
  if (next !== current) store.setState({ workspace: next });
}

/** Creates an empty code file (optionally in a folder), opens its window and makes it the active one. */
export function createCodeFile(store: GameStore, folder: string | null = null): string {
  const id = `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  updateWorkspace(store, (workspace) => addFile(workspace, id, folder));
  store.setState({ activeFileId: id });
  return id;
}

export function createGameStore({ game, workspace = createWorkspace(DEFAULT_CODE) }: InitialStoreData): GameStore {
  return createStore<GameStoreState>(() => ({
    game,
    workspace,
    activeFileId: MAIN_FILE_ID,
    runningFileId: null,
    runStatus: 'idle',
    currentLocation: null,
    lastError: null,
    variables: null,
    console: [],
    viewDepth: null,
  }));
}
