import { useState } from 'react';
import { SPEED_PRESETS } from '../game/gameStore.ts';
import { FileMenu } from './FileMenu.tsx';
import { useGame, useGameState } from './gameContext.ts';
import { MenuIcon, PlusIcon } from './icons.tsx';

interface ToolbarProps {
  onOpenCode: () => void;
  outputOpen: boolean;
  onToggleOutput: () => void;
}

/** Top-right square buttons, like the game's; the menu holds speed, output and save management. */
export function Toolbar({ onOpenCode, outputOpen, onToggleOutput }: ToolbarProps) {
  const { loop } = useGame();
  const speed = useGameState((s) => s.speed);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="absolute top-3 right-3 z-[30] flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button type="button" className="farm-square-button farm-square-button-olive farm-toolbar-button" title="Open code window" onClick={onOpenCode}>
          <PlusIcon />
        </button>
        <button
          type="button"
          className="farm-square-button farm-square-button-olive farm-toolbar-button"
          title="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MenuIcon />
        </button>
      </div>
      {menuOpen && (
        <div className="farm-menu w-64 p-3 text-sm">
          <div className="mb-1 font-semibold text-stone-200">Speed</div>
          <div className="mb-3 flex gap-1" role="group" aria-label="Speed">
            {SPEED_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => loop.setSpeed(preset.opsPerSecond)}
                className={`farm-chip ${preset.opsPerSecond === speed ? 'farm-chip-active' : ''}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-stone-200">
            <input type="checkbox" checked={outputOpen} onChange={onToggleOutput} className="accent-lime-600" />
            Show output window
          </label>
          <div className="mb-1 font-semibold text-stone-200">Save</div>
          <FileMenu />
        </div>
      )}
    </div>
  );
}
