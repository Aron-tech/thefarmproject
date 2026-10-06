import { lazy, Suspense, useState, type KeyboardEvent } from 'react';
import { fileNameProblem, MAIN_FILE_ID, renameFile, setFileWindow, type CodeFile } from '../core/state/codeFiles.ts';
import { updateWorkspace } from '../game/gameStore.ts';
import { FloatingWindow, WindowButton } from './FloatingWindow.tsx';
import { useGame, useGameState } from './gameContext.ts';
import { PauseIcon, PlayIcon, StepIcon, StopIcon } from './icons.tsx';

// Monaco is large; load it as a separate chunk so the farm renders first.
const EditorPanel = lazy(() => import('./EditorPanel.tsx'));

const WINDOW_CASCADE = 28;

interface FileTitleProps {
  file: CodeFile;
  active: boolean;
  draft: string | null;
  setDraft: (draft: string | null) => void;
}

/** Title of a code window: the file name, or an input while it is being renamed. */
function FileTitle({ file, active, draft, setDraft }: FileTitleProps) {
  const { store } = useGame();
  const problem = draft === null || draft === file.name ? null : fileNameProblem(store.getState().workspace, draft, file.id);

  const commit = () => {
    if (draft !== null && problem === null) updateWorkspace(store, (workspace) => renameFile(workspace, file.id, draft));
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
    else if (event.key === 'Escape') setDraft(null);
    event.stopPropagation();
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        spellCheck={false}
        title={problem ?? 'Enter to rename, Esc to cancel'}
        aria-invalid={problem !== null}
        className={`farm-title-input ${problem ? 'farm-title-input-invalid' : ''}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        onFocus={(event) => event.target.select()}
      />
    );
  }
  return (
    <span className={active ? 'text-white' : 'text-stone-400'} title={file.id === MAIN_FILE_ID ? undefined : 'Double-click to rename'}>
      {file.name}
    </span>
  );
}

/**
 * A code window for one file. Like in the game, the title bar holds run (▶) and step (▷); the window
 * whose program is running shows stop (■) and pause (❚❚) instead. Running a file lets it import the others.
 */
export function CodeWindow({ file, index }: { file: CodeFile; index: number }) {
  const { store, loop } = useGame();
  const runStatus = useGameState((s) => s.runStatus);
  const isRunningFile = useGameState((s) => s.runningFileId === file.id && s.runStatus !== 'idle');
  const active = useGameState((s) => s.activeFileId === file.id);
  const [draft, setDraft] = useState<string | null>(null);
  // The main file keeps its name; nothing is renamed while a program runs.
  const renamable = file.id !== MAIN_FILE_ID && runStatus === 'idle';

  const leadingActions = !isRunningFile ? (
    <>
      <WindowButton title="Execute (F5)" onClick={() => loop.run(file.id)}>
        <PlayIcon />
      </WindowButton>
      <WindowButton title="Step (F10)" onClick={() => loop.step(file.id)}>
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

  const offset = index * WINDOW_CASCADE;
  return (
    <FloatingWindow
      id={`code-${file.id}`}
      title={<FileTitle file={file} active={active} draft={draft} setDraft={setDraft} />}
      onTitleDoubleClick={renamable ? () => setDraft(file.name) : undefined}
      initialRect={{
        x: Math.max(16, window.innerWidth - 540 - offset),
        y: 100 + offset,
        width: 520,
        height: Math.min(460, window.innerHeight - 330),
      }}
      leadingActions={leadingActions}
      minimized={file.minimized}
      onMinimizedChange={(minimized) => updateWorkspace(store, (workspace) => setFileWindow(workspace, file.id, { minimized }))}
      onActivate={() => {
        if (store.getState().activeFileId !== file.id) store.setState({ activeFileId: file.id });
      }}
      onClose={() => updateWorkspace(store, (workspace) => setFileWindow(workspace, file.id, { open: false }))}
    >
      <Suspense fallback={<div className="p-4 text-sm text-stone-400">Loading editor…</div>}>
        <EditorPanel fileId={file.id} />
      </Suspense>
    </FloatingWindow>
  );
}
