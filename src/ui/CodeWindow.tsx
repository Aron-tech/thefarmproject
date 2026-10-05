import { lazy, Suspense, useEffect } from 'react';
import { FloatingWindow, WindowButton } from './FloatingWindow.tsx';
import { useGame, useGameState } from './gameContext.ts';
import { PauseIcon, PlayIcon, StepIcon, StopIcon } from './icons.tsx';

// Monaco is large; load it as a separate chunk so the farm renders first.
const EditorPanel = lazy(() => import('./EditorPanel.tsx'));

/**
 * The code window. Like in the game, the title bar holds run (▶) and step (▷) while idle, and turns into
 * stop (■) and pause (❚❚) while the program runs.
 */
export function CodeWindow({ onClose }: { onClose: () => void }) {
  const { loop } = useGame();
  const runStatus = useGameState((s) => s.runStatus);

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

  const leadingActions =
    runStatus === 'idle' ? (
      <>
        <WindowButton title="Execute (F5)" onClick={() => loop.run()}>
          <PlayIcon />
        </WindowButton>
        <WindowButton title="Step (F10)" onClick={() => loop.step()}>
          <StepIcon />
        </WindowButton>
      </>
    ) : (
      <>
        <WindowButton title="Stop (Shift+F5)" tone="alert" onClick={() => loop.stop()}>
          <StopIcon />
        </WindowButton>
        {runStatus === 'running' ? (
          <WindowButton title="Pause" tone="alert" onClick={() => loop.pause()}>
            <PauseIcon />
          </WindowButton>
        ) : (
          <>
            <WindowButton title="Continue (F5)" tone="alert" onClick={() => loop.resume()}>
              <PlayIcon />
            </WindowButton>
            <WindowButton title="Step (F10)" tone="alert" onClick={() => loop.step()}>
              <StepIcon />
            </WindowButton>
          </>
        )}
      </>
    );

  return (
    <FloatingWindow
      id="code-main"
      title="main"
      initialRect={{ x: Math.max(16, window.innerWidth - 540), y: 100, width: 520, height: Math.min(460, window.innerHeight - 330) }}
      leadingActions={leadingActions}
      onClose={onClose}
    >
      <Suspense fallback={<div className="p-4 text-sm text-stone-400">Loading editor…</div>}>
        <EditorPanel />
      </Suspense>
    </FloatingWindow>
  );
}
