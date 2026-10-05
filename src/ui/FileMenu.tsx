import { useRef, type ChangeEvent } from 'react';
import { createGameState } from '../core/state/gameState.ts';
import { exportSaveFile, readSaveFile } from '../game/persistence.ts';
import { useGame } from './gameContext.ts';

const buttonClass = 'farm-chip';

export function FileMenu() {
  const { store, loop } = useGame();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const save = await readSaveFile(file);
      loop.replaceGame(save.game);
      store.setState({ code: save.code });
      loop.setSpeed(save.speed);
      loop.log('info', `Imported save from ${file.name}.`);
    } catch (error) {
      loop.log('error', error instanceof Error ? error.message : String(error));
    }
  };

  const handleReset = () => {
    if (!window.confirm('Reset the farm? Your inventory and field will be lost (your code is kept).')) return;
    loop.replaceGame(createGameState());
    loop.log('info', 'Farm reset.');
  };

  return (
    <div className="flex items-center gap-1">
      <button type="button" className={buttonClass} onClick={() => exportSaveFile(store, loop)}>
        Export
      </button>
      <button type="button" className={buttonClass} onClick={() => fileInputRef.current?.click()}>
        Import
      </button>
      <button type="button" className={buttonClass} onClick={handleReset}>
        Reset
      </button>
      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
    </div>
  );
}
