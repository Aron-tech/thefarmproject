import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { findFile, setFileCode } from '../core/state/codeFiles.ts';
import { updateWorkspace } from '../game/gameStore.ts';
import { FARM_LANGUAGE, FARM_THEME, monaco } from './monacoSetup.ts';
import { useGame, useGameState } from './gameContext.ts';

type CodeEditor = Parameters<OnMount>[0];

const MARKER_OWNER = 'farm-runtime';

const NO_BREAKPOINTS: number[] = [];

/** Monaco editor for one code file, with breakpoints in the glyph margin, current-line highlight and error markers. */
export default function EditorPanel({ fileId }: { fileId: string }) {
  const { store, loop } = useGame();
  const file = useGameState((s) => findFile(s.workspace, fileId));
  const code = file?.code ?? '';
  const fileName = file?.name;
  const breakpoints = file?.breakpoints ?? NO_BREAKPOINTS;
  // Only locations inside this file matter here.
  const currentLine = useGameState((s) => (s.currentLocation && s.currentLocation.file === fileName ? s.currentLocation.line : null));
  const runStatus = useGameState((s) => s.runStatus);
  const lastError = useGameState((s) => (s.lastError?.location?.file === fileName ? s.lastError : null));

  const [editor, setEditor] = useState<CodeEditor | null>(null);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  const handleMount: OnMount = (mounted) => {
    decorationsRef.current = mounted.createDecorationsCollection();
    setEditor(mounted);
    mounted.onMouseDown((event) => {
      const { type, position } = event.target;
      const isGutter =
        type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
      if (!isGutter || !position) return;
      const line = position.lineNumber;
      const current = findFile(store.getState().workspace, fileId)?.breakpoints ?? [];
      const next = current.includes(line) ? current.filter((l) => l !== line) : [...current, line].sort((a, b) => a - b);
      loop.setBreakpoints(fileId, next);
    });
  };

  useEffect(() => {
    const decorations = decorationsRef.current;
    if (!decorations) return;
    const lineDecoration = (line: number, options: monaco.editor.IModelDecorationOptions) => ({
      range: new monaco.Range(line, 1, line, 1),
      options,
    });
    const items = breakpoints.map((line) =>
      lineDecoration(line, { glyphMarginClassName: 'farm-breakpoint', glyphMarginHoverMessage: { value: 'Breakpoint' } }),
    );
    if (runStatus !== 'idle' && currentLine !== null) {
      items.push(
        lineDecoration(currentLine, {
          isWholeLine: true,
          className: runStatus === 'paused' ? 'farm-paused-line' : 'farm-current-line',
        }),
      );
    }
    const errorLine = lastError?.location?.line;
    if (errorLine) {
      items.push(lineDecoration(errorLine, { isWholeLine: true, className: 'farm-error-line' }));
    }
    decorations.set(items);
  }, [editor, breakpoints, currentLine, runStatus, lastError]);

  useEffect(() => {
    const model = editor?.getModel();
    if (!model) return;
    const line = lastError?.location?.line;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      lastError && line
        ? [
            {
              severity: monaco.MarkerSeverity.Error,
              message: lastError.message,
              startLineNumber: line,
              endLineNumber: line,
              startColumn: model.getLineFirstNonWhitespaceColumn(line) || 1,
              endColumn: model.getLineMaxColumn(line),
            },
          ]
        : [],
    );
  }, [editor, lastError]);

  useEffect(() => {
    if (runStatus === 'paused' && currentLine !== null) editor?.revealLineInCenterIfOutsideViewport(currentLine);
  }, [editor, runStatus, currentLine]);

  return (
    <Editor
      path={`file:///${fileId}.py`}
      language={FARM_LANGUAGE}
      theme={FARM_THEME}
      value={code}
      onChange={(value) => updateWorkspace(store, (workspace) => setFileCode(workspace, fileId, value ?? ''))}

      onMount={handleMount}
      options={{
        // As in the game, code can only be edited while it is not running.
        readOnly: runStatus !== 'idle',
        glyphMargin: true,
        lineNumbers: 'off',
        folding: false,
        lineDecorationsWidth: 6,
        minimap: { enabled: false },
        fontSize: 15,
        lineHeight: 22,
        tabSize: 4,
        insertSpaces: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        renderLineHighlight: 'none',
        guides: { indentation: false },
        fontFamily: "'Fira Mono', Consolas, monospace",
        padding: { top: 8 },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
    />
  );
}
