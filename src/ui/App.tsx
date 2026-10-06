import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { createCodeFile } from '../game/gameStore.ts';
import { FarmScene } from '../rendering/FarmScene.tsx';
import { CodeWindow } from './CodeWindow.tsx';
import { FilesWindow } from './FilesWindow.tsx';
import { GameContext, type GameServices } from './gameContext.ts';
import { GuideWindow } from './GuideWindow.tsx';
import { ItemsPanel } from './ItemsPanel.tsx';
import { MainMenu } from './MainMenu.tsx';
import { OutputWindow } from './OutputWindow.tsx';
import { Toolbar } from './Toolbar.tsx';
import { UnlockTree } from './UnlockTree.tsx';

type Overlay = 'none' | 'unlocks' | 'menu';

/** The farm floats in the middle of the screen; code, output and other windows float above it, as in the game. */
export function App({ services }: { services: GameServices }) {
  const { store, loop } = services;
  const files = useStore(store, (s) => s.workspace.files);
  const [outputOpen, setOutputOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>('none');

  // Esc closes whatever is open, otherwise opens the main menu. The code editor keeps Esc for itself.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('.monaco-editor, input')) return;
      setOverlay((current) => (current === 'none' ? 'menu' : 'none'));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // F5 runs (or continues) the active code window, Shift+F5 stops, F10 steps.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F5') {
        event.preventDefault();
        if (event.shiftKey) loop.stop();
        else if (loop.isPaused()) loop.resume();
        else loop.run();
      } else if (event.key === 'F10') {
        event.preventDefault();
        loop.step();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [loop]);

  const close = () => setOverlay('none');

  return (
    <GameContext.Provider value={services}>
      <div className="farm-backdrop relative h-full w-full overflow-hidden">
        <div className="absolute inset-0">
          <FarmScene store={store} loop={loop} />
        </div>
        <ItemsPanel />
        <Toolbar
          onNewFile={() => createCodeFile(store)}
          onToggleFiles={() => setFilesOpen((open) => !open)}
          onToggleGuide={() => setGuideOpen((open) => !open)}
          onOpenUnlocks={() => setOverlay('unlocks')}
          onOpenMenu={() => setOverlay('menu')}
        />
        {files.map((file, index) => file.open && <CodeWindow key={file.id} file={file} index={index} />)}
        {outputOpen && <OutputWindow onClose={() => setOutputOpen(false)} />}
        {filesOpen && <FilesWindow onClose={() => setFilesOpen(false)} />}
        {guideOpen && <GuideWindow onClose={() => setGuideOpen(false)} />}
        {overlay === 'unlocks' && <UnlockTree onClose={close} />}
        {overlay === 'menu' && <MainMenu onClose={close} outputOpen={outputOpen} onToggleOutput={() => setOutputOpen((open) => !open)} />}
      </div>
    </GameContext.Provider>
  );
}
