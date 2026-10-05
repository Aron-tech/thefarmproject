import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { GameLoop } from '../game/GameLoop.ts';
import type { GameStore, GameStoreState } from '../game/gameStore.ts';

export interface GameServices {
  store: GameStore;
  loop: GameLoop;
}

export const GameContext = createContext<GameServices | null>(null);

export function useGame(): GameServices {
  const services = useContext(GameContext);
  if (!services) throw new Error('useGame must be used inside a GameContext provider');
  return services;
}

/** Subscribes to a slice of the game store. The selector must return a stored reference or a primitive. */
export function useGameState<T>(selector: (state: GameStoreState) => T): T {
  return useStore(useGame().store, selector);
}
