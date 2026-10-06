import { useRef, type ChangeEvent } from 'react';
import { createGameState } from '../core/state/gameState.ts';
import { exportSaveFile, readSaveFile, writeSave } from '../game/persistence.ts';
import { useGame } from './gameContext.ts';

interface MainMenuProps {
  onClose: () => void;
  outputOpen: boolean;
  onToggleOutput: () => void;
}

/** The pause menu opened with Esc or the cog button: saving, loading, resetting and display settings. */
export function MainMenu({ onClose, outputOpen, onToggleOutput }: MainMenuProps) {
  const { store, loop } = useGame();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    try {
      await writeSave(store, loop);
      loop.log('info', 'Game saved.');
    } catch (error) {
      loop.log('error', `Saving failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const save = await readSaveFile(file);
      loop.loadSave(save.game, save.workspace);
      loop.log('info', `Loaded save from ${file.name}.`);
      onClose();
    } catch (error) {
      loop.log('error', error instanceof Error ? error.message : String(error));
    }
  };

  const handleReset = () => {
    if (!window.confirm('Start a new farm? Your inventory, farm and unlocks will be lost (your code is kept).')) return;
    loop.replaceGame(createGameState());
    loop.log('info', 'Started a new farm.');
    onClose();
  };

  return (
    <div className="absolute inset-0 z-[50] flex items-center justify-center bg-black/45 p-4" onPointerDown={onClose}>
      <div
        className="farm-menu flex w-72 flex-col gap-2 p-5"
        role="dialog"
        aria-label="Menu"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 className="mb-2 text-center text-xl font-bold text-white">Menu</h2>
        <button type="button" className="farm-menu-button farm-menu-button-primary" onClick={onClose}>
          Resume
        </button>
        <button type="button" className="farm-menu-button" onClick={() => void handleSave()}>
          Save
        </button>
        <button type="button" className="farm-menu-button" onClick={() => exportSaveFile(store, loop)}>
          Export save file
        </button>
        <button type="button" className="farm-menu-button" onClick={() => fileInputRef.current?.click()}>
          Load save file
        </button>
        <label className="my-1 flex cursor-pointer items-center gap-2 px-1 text-sm font-semibold text-stone-200">
          <input type="checkbox" checked={outputOpen} onChange={onToggleOutput} className="h-4 w-4 accent-lime-600" />
          Show output window
        </label>
        <button type="button" className="farm-menu-button farm-menu-button-danger" onClick={handleReset}>
          New farm
        </button>
        <p className="mt-1 text-center text-xs text-stone-400">The game also saves automatically.</p>
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
      </div>
    </div>
  );
}
