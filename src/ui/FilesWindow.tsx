import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  addFolder,
  deleteFile,
  deleteFolder,
  fileNameProblem,
  folderNameProblem,
  MAIN_FILE_ID,
  moveFileToFolder,
  renameFile,
  renameFolder,
  setFileWindow,
  setFolderWindows,
  type CodeFile,
  type Workspace,
} from '../core/state/codeFiles.ts';
import { createCodeFile, updateWorkspace } from '../game/gameStore.ts';
import { FloatingWindow } from './FloatingWindow.tsx';
import { useGame, useGameState } from './gameContext.ts';
import { ChevronIcon, TrashIcon } from './icons.tsx';

const DRAG_TYPE = 'application/x-farm-file';

/** A name shown as text that turns into an input on double click; `problem` validates the draft. */
function EditableName({
  name,
  editable,
  problem,
  onRename,
  className,
}: {
  name: string;
  editable: boolean;
  problem: (draft: string) => string | null;
  onRename: (name: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const issue = draft === null || draft === name ? null : problem(draft);
  const commit = () => {
    if (draft !== null && draft !== name && issue === null) onRename(draft);
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
        title={issue ?? 'Enter to rename, Esc to cancel'}
        aria-invalid={issue !== null}
        className={`farm-title-input ${issue ? 'farm-title-input-invalid' : ''}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        onFocus={(event) => event.target.select()}
        onClick={(event) => event.stopPropagation()}
      />
    );
  }
  return (
    <span
      className={`min-w-0 truncate ${className ?? ''}`}
      title={editable ? 'Double-click to rename' : undefined}
      onDoubleClick={editable ? () => setDraft(name) : undefined}
    >
      {name}
    </span>
  );
}

function SmallButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="farm-chip whitespace-nowrap px-2.5 py-1 text-[13px]"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function FileRow({ file, workspace, running }: { file: CodeFile; workspace: Workspace; running: boolean }) {
  const { store } = useGame();
  const active = useGameState((s) => s.activeFileId === file.id);
  const isMain = file.id === MAIN_FILE_ID;

  const open = () => {
    updateWorkspace(store, (ws) => setFileWindow(ws, file.id, { open: true, minimized: false }));
    store.setState({ activeFileId: file.id });
  };
  const remove = () => {
    if (!window.confirm(`Delete "${file.name}"? Its code will be lost.`)) return;
    updateWorkspace(store, (ws) => deleteFile(ws, file.id));
    if (store.getState().activeFileId === file.id) store.setState({ activeFileId: MAIN_FILE_ID });
  };

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, file.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={open}
      className={`farm-file-row group flex cursor-pointer items-center gap-2.5 py-1.5 pr-2 pl-8 text-base ${active ? 'farm-file-row-active' : ''}`}
      title={file.open ? `${file.name}: click to show, drag to move` : `${file.name} (closed): click to open, drag to move`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${file.open ? (file.minimized ? 'bg-amber-400' : 'bg-lime-500') : 'bg-stone-600'}`} />
      <EditableName
        name={file.name}
        editable={!isMain && !running}
        problem={(draft) => fileNameProblem(workspace, draft, file.id)}
        onRename={(name) => updateWorkspace(store, (ws) => renameFile(ws, file.id, name))}
        className={file.open ? 'text-stone-100' : 'text-stone-400'}
      />
      <span className="flex-1" />
      {!isMain && (
        <span className="opacity-0 transition-opacity group-hover:opacity-100">
          <SmallButton title={`Delete ${file.name}`} onClick={remove}>
            <TrashIcon />
          </SmallButton>
        </span>
      )}
    </li>
  );
}

/** A folder (or the top level, folder = null): a drop target for files, with actions for all its windows. */
function FolderSection({ folder, files, workspace, running }: { folder: string | null; files: CodeFile[]; workspace: Workspace; running: boolean }) {
  const { store } = useGame();
  const [expanded, setExpanded] = useState(true);
  const [dropping, setDropping] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDropping(false);
    const id = event.dataTransfer.getData(DRAG_TYPE);
    if (id) updateWorkspace(store, (ws) => moveFileToFolder(ws, id, folder));
  };
  const setWindows = (window: Partial<Pick<CodeFile, 'open' | 'minimized'>>) =>
    updateWorkspace(store, (ws) => setFolderWindows(ws, folder, window));

  return (
    <section
      className={`farm-folder ${dropping ? 'farm-folder-drop' : ''}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={onDrop}
    >
      <header className="px-2 pt-1.5 pb-1">
        <div className="flex items-center gap-2">
          <button type="button" className="text-stone-400 hover:text-white" aria-label={expanded ? 'Collapse' : 'Expand'} onClick={() => setExpanded(!expanded)}>
            <ChevronIcon open={expanded} />
          </button>
          {folder === null ? (
            <span className="text-base font-semibold text-stone-300">Files</span>
          ) : (
            <EditableName
              name={folder}
              editable
              problem={(draft) => folderNameProblem(workspace, draft, folder)}
              onRename={(name) => updateWorkspace(store, (ws) => renameFolder(ws, folder, name))}
              className="text-base font-semibold text-stone-200"
            />
          )}
          <span className="text-xs text-stone-500">{files.length}</span>
          <span className="flex-1" />
          {folder !== null && (
            <SmallButton title={`Delete folder ${folder} (its files are kept)`} onClick={() => updateWorkspace(store, (ws) => deleteFolder(ws, folder))}>
              <TrashIcon />
            </SmallButton>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-5">
          <SmallButton title={folder === null ? 'New file' : `New file in ${folder}`} onClick={() => createCodeFile(store, folder)}>
            + File
          </SmallButton>
          {files.length > 0 && (
            <>
              <SmallButton title="Show all windows" onClick={() => setWindows({ open: true, minimized: false })}>
                Show
              </SmallButton>
              <SmallButton title="Minimise all windows" onClick={() => setWindows({ minimized: true })}>
                Minimise
              </SmallButton>
              <SmallButton title="Close all windows" onClick={() => setWindows({ open: false })}>
                Hide
              </SmallButton>
            </>
          )}
        </div>
      </header>
      {expanded && (
        <ul>
          {files.map((file) => (
            <FileRow key={file.id} file={file} workspace={workspace} running={running} />
          ))}
          {files.length === 0 && <li className="py-1.5 pl-8 text-sm text-stone-500 italic">Drag files here</li>}
        </ul>
      )}
    </section>
  );
}

/** Lists every code file, grouped into folders. Files can be opened, renamed, deleted and dragged between folders. */
export function FilesWindow({ onClose }: { onClose: () => void }) {
  const { store } = useGame();
  const workspace = useGameState((s) => s.workspace);
  const running = useGameState((s) => s.runStatus !== 'idle');
  const inFolder = (folder: string | null) => workspace.files.filter((file) => file.folder === folder);

  return (
    <FloatingWindow
      id="files-v2"
      title="Files"
      initialRect={{ x: 16, y: 110, width: 460, height: Math.min(560, window.innerHeight - 160) }}
      trailingActions={
        <button
          type="button"
          className="farm-chip mr-1 px-3 py-1 text-[13px]"
          title="New folder"
          onClick={() => updateWorkspace(store, (ws) => addFolder(ws)[0])}
        >
          + Folder
        </button>
      }
      onClose={onClose}
    >
      <div className="h-full overflow-y-auto py-2 text-sm">
        <FolderSection folder={null} files={inFolder(null)} workspace={workspace} running={running} />
        {workspace.folders.map((folder) => (
          <FolderSection key={folder} folder={folder} files={inFolder(folder)} workspace={workspace} running={running} />
        ))}
        <p className="px-4 pt-3 pb-2 text-sm leading-relaxed text-stone-500">
          Use another file from code with <code className="text-stone-300">import name</code> or{' '}
          <code className="text-stone-300">from name import *</code>.
        </p>
      </div>
    </FloatingWindow>
  );
}
