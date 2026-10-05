import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

// Bundle Monaco locally instead of loading it from a CDN: the game must work fully offline.
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });

export const FARM_LANGUAGE = 'farm-python';
export const FARM_THEME = 'farm-dark';

const KEYWORDS = [
  'and', 'as', 'break', 'continue', 'def', 'elif', 'else', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'not', 'or', 'pass', 'return', 'while', 'True', 'False', 'None',
];
const GAME_CONSTANTS = ['North', 'East', 'South', 'West'];

/**
 * Python tokenizer that also marks game constants (North, Entities.Carrot, …), so they can be coloured
 * like keywords, as the game's editor does.
 */
monaco.languages.register({ id: FARM_LANGUAGE, extensions: ['.py'], aliases: ['Python'] });
monaco.languages.setLanguageConfiguration(FARM_LANGUAGE, {
  comments: { lineComment: '#' },
  brackets: [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: "'", close: "'", notIn: ['string'] },
  ],
  onEnterRules: [
    {
      beforeText: /:\s*(#.*)?$/,
      action: { indentAction: monaco.languages.IndentAction.Indent },
    },
  ],
});
monaco.languages.setMonarchTokensProvider(FARM_LANGUAGE, {
  keywords: KEYWORDS,
  constants: GAME_CONSTANTS,
  tokenizer: {
    root: [
      [/#.*$/, 'comment'],
      [/\b(Entities|Grounds|Items)\.[A-Za-z_]\w*/, 'constant'],
      [/[A-Za-z_]\w*/, { cases: { '@keywords': 'keyword', '@constants': 'constant', '@default': 'identifier' } }],
      [/\d+(\.\d*)?([eE][+-]?\d+)?/, 'number'],
      [/"([^"\\]|\\.)*"/, 'string'],
      [/'([^'\\]|\\.)*'/, 'string'],
      [/[()[\]{}]/, '@brackets'],
      [/[=+\-*/%<>!&|^~:.,;]/, 'delimiter'],
    ],
  },
});

/** Matches the game's code windows: near-black background, white code, yellow keywords and constants. */
monaco.editor.defineTheme(FARM_THEME, {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'e8e8e8' },
    { token: 'keyword', foreground: 'f2d14b' },
    { token: 'constant', foreground: 'eedd7a' },
    { token: 'number', foreground: 'f2d14b' },
    { token: 'string', foreground: 'c8e08a' },
    { token: 'comment', foreground: 'c7c7c7' },
    { token: 'identifier', foreground: 'e8e8e8' },
    { token: 'delimiter', foreground: 'e8e8e8' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editorGutter.background': '#1e1e1e',
    'editor.foreground': '#e8e8e8',
    'editor.selectionBackground': '#4a4a4a',
    'editor.wordHighlightBackground': '#ffffff22',
    'editorCursor.foreground': '#ffffff',
    'editorIndentGuide.background1': '#00000000',
    'editorIndentGuide.activeBackground1': '#00000000',
    'editorBracketMatch.background': '#ffffff18',
    'editorBracketMatch.border': '#00000000',
    'scrollbarSlider.background': '#ffffff22',
  },
});

export { monaco };
