import { useState } from 'react';
import { FarmScene } from '../rendering/FarmScene.tsx';
import { CodeWindow } from './CodeWindow.tsx';
import { GameContext, type GameServices } from './gameContext.ts';
import { ItemsPanel } from './ItemsPanel.tsx';
import { OutputWindow } from './OutputWindow.tsx';
import { Toolbar } from './Toolbar.tsx';

/** The farm floats in the middle of the screen; code and output windows float above it, as in the game. */
export function App({ services }: { services: GameServices }) {
  const [codeOpen, setCodeOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(true);

  return (
    <GameContext.Provider value={services}>
      <div className="farm-backdrop relative h-full w-full overflow-hidden">
        <div className="absolute inset-0">
          <FarmScene store={services.store} loop={services.loop} />
        </div>
        <ItemsPanel />
        <Toolbar onOpenCode={() => setCodeOpen(true)} outputOpen={outputOpen} onToggleOutput={() => setOutputOpen((open) => !open)} />
        {codeOpen && <CodeWindow onClose={() => setCodeOpen(false)} />}
        {outputOpen && <OutputWindow onClose={() => setOutputOpen(false)} />}
      </div>
    </GameContext.Provider>
  );
}
