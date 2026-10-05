import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { FARM_LANGUAGE, FARM_THEME, monaco } from './monacoSetup.ts';
import { useGame, useGameState } from './gameContext.ts';

type CodeEditor = Parameters<OnMount>[0];

const MARKER_OWNER = 'farm-runtime';

/** Monaco editor with breakpoints in the glyph margin, current-line highlight and error markers. */
export default function EditorPanel() {
  const { store, loop } = useGame();
  const code = useGameState((s) => s.code);
  const breakpoints = useGameState((s) => s.breakpoints);
  const currentLine = useGameState((s) => s.currentLine);
  const runStatus = useGameState((s) => s.runStatus);
  const lastError = useGameState((s) => s.lastError);

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
      const current = store.getState().breakpoints;
      const next = current.includes(line) ? current.filter((l) => l !== line) : [...current, line].sort((a, b) => a - b);
      loop.setBreakpoints(next);
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
    if (lastError?.line) {
      items.push(lineDecoration(lastError.line, { isWholeLine: true, className: 'farm-error-line' }));
    }
    decorations.set(items);
  }, [editor, breakpoints, currentLine, runStatus, lastError]);

  useEffect(() => {
    const model = editor?.getModel();
    if (!model) return;
    const line = lastError?.line;
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
      language={FARM_LANGUAGE}
      theme={FARM_THEME}
      value={code}
      onChange={(value) => store.setState({ code: value ?? '' })}
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
