import { getCompletions, getSignatureHelp, type CompletionKind, type CompletionRequest } from '../core/interpreter/completions.ts';
import { findFile, workspaceSources } from '../core/state/codeFiles.ts';
import type { GameStore } from '../game/gameStore.ts';
import { FARM_LANGUAGE, monaco } from './monacoSetup.ts';

/**
 * IDE-style suggestions and parameter hints in the code windows, offering only what is unlocked.
 * Monaco providers are global, so they are registered once and read the store connected last.
 */

let connectedStore: GameStore | null = null;

const KIND_MAP: Record<CompletionKind, monaco.languages.CompletionItemKind> = {
  function: monaco.languages.CompletionItemKind.Function,
  keyword: monaco.languages.CompletionItemKind.Keyword,
  constant: monaco.languages.CompletionItemKind.EnumMember,
  namespace: monaco.languages.CompletionItemKind.Enum,
  module: monaco.languages.CompletionItemKind.Module,
  variable: monaco.languages.CompletionItemKind.Variable,
  method: monaco.languages.CompletionItemKind.Method,
};

/** Builds a completion request for a position in a code window's model (models are named file:///<fileId>.py). */
function requestFor(model: monaco.editor.ITextModel, position: monaco.Position): CompletionRequest | null {
  if (!connectedStore) return null;
  const { workspace, game } = connectedStore.getState();
  const fileId = model.uri.path.replace(/^\//, '').replace(/\.py$/, '');
  const file = findFile(workspace, fileId);
  if (!file) return null;
  return {
    unlocks: game.unlocks,
    linePrefix: model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column)),
    source: model.getValue(),
    fileName: file.name,
    files: workspaceSources(workspace),
  };
}

monaco.languages.registerCompletionItemProvider(FARM_LANGUAGE, {
  triggerCharacters: ['.', ' ', ','],
  provideCompletionItems(model, position) {
    const request = requestFor(model, position);
    if (!request) return { suggestions: [] };
    // A space only opens the list after `import` / `from x import`.
    if (/\s$/.test(request.linePrefix) && !/^\s*(import|from)\b/.test(request.linePrefix)) return { suggestions: [] };
    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    return {
      suggestions: getCompletions(request).map((completion) => ({
        label: completion.label,
        kind: KIND_MAP[completion.kind],
        detail: completion.detail,
        documentation: completion.documentation,
        insertText: completion.insertSnippet ?? completion.label,
        insertTextRules: completion.insertSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
        sortText: `${completion.rank}${completion.label}`,
        range,
        // Accepting a call reopens parameter hints, as in an IDE.
        command: completion.insertSnippet?.includes('(') ? { id: 'editor.action.triggerParameterHints', title: '' } : undefined,
      })),
    };
  },
});

monaco.languages.registerSignatureHelpProvider(FARM_LANGUAGE, {
  signatureHelpTriggerCharacters: ['(', ','],
  signatureHelpRetriggerCharacters: [','],
  provideSignatureHelp(model, position) {
    const request = requestFor(model, position);
    const help = request && getSignatureHelp(request);
    if (!help) return null;
    return {
      value: {
        signatures: [{ label: help.label, documentation: help.documentation, parameters: help.params.map((param) => ({ label: param })) }],
        activeSignature: 0,
        activeParameter: help.activeParam,
      },
      dispose: () => {},
    };
  },
});

/** Points the providers at a game's store; returns a function that disconnects it again. */
export function connectCodeCompletion(store: GameStore): () => void {
  connectedStore = store;
  return () => {
    if (connectedStore === store) connectedStore = null;
  };
}
