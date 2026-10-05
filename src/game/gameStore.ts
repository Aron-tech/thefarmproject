import { createStore, type StoreApi } from 'zustand/vanilla';
import type { VariableSnapshot } from '../core/interpreter/evaluator.ts';
import type { OpsPerSecond } from '../core/interpreter/protocol.ts';
import type { GameState } from '../core/state/types.ts';

export type RunStatus = 'idle' | 'running' | 'paused';

export interface ConsoleEntry {
  id: number;
  kind: 'print' | 'error' | 'info';
  text: string;
}

export interface SpeedPreset {
  label: string;
  opsPerSecond: OpsPerSecond;
}

export const BASE_OPS_PER_SECOND = 1000;

export const SPEED_PRESETS: readonly SpeedPreset[] = [
  { label: '1×', opsPerSecond: BASE_OPS_PER_SECOND },
  { label: '2×', opsPerSecond: BASE_OPS_PER_SECOND * 2 },
  { label: '5×', opsPerSecond: BASE_OPS_PER_SECOND * 5 },
  { label: '20×', opsPerSecond: BASE_OPS_PER_SECOND * 20 },
  { label: 'Max', opsPerSecond: null },
];

export const DEFAULT_CODE = `# Harvest the whole field, forever.
while True:
    for i in range(get_world_size()):
        if can_harvest():
            harvest()
        move(North)
    move(East)
`;

export interface GameStoreState {
  game: GameState;
  code: string;
  breakpoints: number[];
  speed: OpsPerSecond;
  runStatus: RunStatus;
  /** Line of the statement currently executing (or about to, when paused). */
  currentLine: number | null;
  errorLine: number | null;
  variables: VariableSnapshot | null;
  console: ConsoleEntry[];
}

export type GameStore = StoreApi<GameStoreState>;

export interface InitialStoreData {
  game: GameState;
  code?: string;
  speed?: OpsPerSecond;
}

export function createGameStore({ game, code = DEFAULT_CODE, speed = BASE_OPS_PER_SECOND }: InitialStoreData): GameStore {
  return createStore<GameStoreState>(() => ({
    game,
    code,
    breakpoints: [],
    speed,
    runStatus: 'idle',
    currentLine: null,
    errorLine: null,
    variables: null,
    console: [],
  }));
}
