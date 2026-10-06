import { get, set } from 'idb-keyval';
import { createSaveData, parseSaveData, parseSaveJson, serializeSave, type SaveData } from '../core/state/save.ts';
import type { GameLoop } from './GameLoop.ts';
import type { GameStore } from './gameStore.ts';

const SAVE_KEY = 'thefarmproject.save';
const AUTOSAVE_INTERVAL_MS = 2000;

/** Loads the autosave from IndexedDB; returns null when there is none or it is unreadable. */
export async function loadSave(): Promise<SaveData | null> {
  try {
    const raw: unknown = await get(SAVE_KEY);
    return raw === undefined ? null : parseSaveData(raw);
  } catch (error) {
    console.warn('Ignoring unreadable save:', error);
    return null;
  }
}

function currentSave(store: GameStore, loop: GameLoop): SaveData {
  return createSaveData(loop.getState(), store.getState().workspace);
}

export async function writeSave(store: GameStore, loop: GameLoop): Promise<void> {
  await set(SAVE_KEY, currentSave(store, loop));
}

/**
 * Saves at most every AUTOSAVE_INTERVAL_MS while the store keeps changing (a debounce would never
 * fire during a long run), and immediately when the page is hidden.
 */
export function startAutosave(store: GameStore, loop: GameLoop): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    writeSave(store, loop).catch((error: unknown) => console.error('Autosave failed:', error));
  };
  const unsubscribe = store.subscribe(() => {
    timer ??= setTimeout(save, AUTOSAVE_INTERVAL_MS);
  });
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (timer) clearTimeout(timer);
      save();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

export function exportSaveFile(store: GameStore, loop: GameLoop): void {
  const blob = new Blob([serializeSave(currentSave(store, loop))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `farm-save-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Reads and validates an imported save file. Throws SaveFormatError when invalid. */
export async function readSaveFile(file: File): Promise<SaveData> {
  return parseSaveJson(await file.text());
}
