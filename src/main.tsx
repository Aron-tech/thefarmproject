import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { InterpreterClient } from './core/interpreter/client.ts';
import { createWorkerTransport } from './core/interpreter/transport.ts';
import { createGameState } from './core/state/gameState.ts';
import { GameLoop } from './game/GameLoop.ts';
import { createGameStore } from './game/gameStore.ts';
import { loadSave, startAutosave } from './game/persistence.ts';
import { App } from './ui/App.tsx';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/fira-mono/400.css';
import '@fontsource/fira-mono/500.css';
import './index.css';

/** Creates the long-lived game services outside React, so StrictMode cannot spawn a second worker. */
async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element #root not found');

  const save = await loadSave();
  const store = createGameStore(save ? { game: save.game, code: save.code, speed: save.speed } : { game: createGameState() });
  const loop = new GameLoop(store, new InterpreterClient(createWorkerTransport()));
  startAutosave(store, loop);
  loop.startIdleClock();

  createRoot(rootElement).render(
    <StrictMode>
      <App services={{ store, loop }} />
    </StrictMode>,
  );
}

void bootstrap();
