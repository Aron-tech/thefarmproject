import { PyError } from './errors.ts';

export type TokenType = 'name' | 'keyword' | 'number' | 'string' | 'op' | 'newline' | 'indent' | 'dedent' | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

export const KEYWORDS: ReadonlySet<string> = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

/** Operators ordered so that longer ones match first. */
const OPERATORS = [
  '**=', '//=', '>>=', '<<=',
  '**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '->', '<<', '>>',
  '+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', '{', '}', ',', ':', '.', ';', '&', '|', '^', '~', '@',
];

const OPENING_BRACKETS = new Set(['(', '[', '{']);
const CLOSING_BRACKETS = new Set([')', ']', '}']);
const TAB_SIZE = 8;

const ESCAPES: Record<string, string> = {
  n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', "'": "'", '"': '"', '\n': '',
};

function isIdentifierStart(ch: string): boolean {
  return /[\p{L}_]/u.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[\p{L}\p{N}_]/u.test(ch);
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

/** Converts source code into tokens, including Python's NEWLINE / INDENT / DEDENT structure. */
export function tokenize(source: string): Token[] {
  const src = source.replace(/\r\n?/g, '\n');
  const tokens: Token[] = [];
  const indentStack = [0];
  let pos = 0;
  let line = 1;
  let lineStart = 0;
  let bracketDepth = 0;
  let atLineStart = true;

  const push = (type: TokenType, value: string, col = pos - lineStart) => {
    tokens.push({ type, value, line, col });
  };
  const error = (message: string) => new PyError('SyntaxError', message, line);

  while (pos < src.length) {
    if (atLineStart && bracketDepth === 0) {
      atLineStart = false;
      let width = 0;
      while (pos < src.length && (src[pos] === ' ' || src[pos] === '\t')) {
        width = src[pos] === '\t' ? (Math.floor(width / TAB_SIZE) + 1) * TAB_SIZE : width + 1;
        pos++;
      }
      const ch = src[pos];
      // Blank and comment-only lines do not affect indentation.
      if (ch === undefined || ch === '\n' || ch === '#') continue;

      const current = indentStack[indentStack.length - 1]!;
      if (width > current) {
        indentStack.push(width);
        push('indent', '', 0);
      } else if (width < current) {
        while (indentStack[indentStack.length - 1]! > width) {
          indentStack.pop();
          push('dedent', '', 0);
        }
        if (indentStack[indentStack.length - 1] !== width) {
          throw new PyError('IndentationError', 'unindent does not match any outer indentation level', line);
        }
      }
      continue;
    }

    const ch = src[pos]!;

    if (ch === '\n') {
      if (bracketDepth === 0) {
        const last = tokens[tokens.length - 1];
        if (last && last.type !== 'newline' && last.type !== 'indent' && last.type !== 'dedent') {
          push('newline', '');
        }
        atLineStart = true;
      }
      pos++;
      line++;
      lineStart = pos;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      pos++;
      continue;
    }
    if (ch === '#') {
      while (pos < src.length && src[pos] !== '\n') pos++;
      continue;
    }
    if (ch === '\\' && src[pos + 1] === '\n') {
      pos += 2;
      line++;
      lineStart = pos;
      continue;
    }

    if (isIdentifierStart(ch)) {
      const start = pos;
      while (pos < src.length && isIdentifierPart(src[pos]!)) pos++;
      const word = src.slice(start, pos);
      const next = src[pos];
      if (next === "'" || next === '"') {
        const prefix = word.toLowerCase();
        if (prefix === 'r') {
          pos = readString(true, start);
          continue;
        }
        if (prefix === 'f' || prefix === 'b' || prefix === 'rf' || prefix === 'fr' || prefix === 'rb' || prefix === 'br') {
          throw error(`string prefix '${word}' is not supported`);
        }
      }
      push(KEYWORDS.has(word) ? 'keyword' : 'name', word, start - lineStart);
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(src[pos + 1]))) {
      const start = pos;
      if (ch === '0' && /[xXoObB]/.test(src[pos + 1] ?? '')) {
        pos += 2;
        while (pos < src.length && /[0-9a-fA-F_]/.test(src[pos]!)) pos++;
      } else {
        while (pos < src.length && /[0-9_]/.test(src[pos]!)) pos++;
        if (src[pos] === '.') {
          pos++;
          while (pos < src.length && /[0-9_]/.test(src[pos]!)) pos++;
        }
        if (src[pos] === 'e' || src[pos] === 'E') {
          const save = pos;
          pos++;
          if (src[pos] === '+' || src[pos] === '-') pos++;
          if (!isDigit(src[pos])) pos = save;
          while (isDigit(src[pos])) pos++;
        }
      }
      if (pos < src.length && isIdentifierPart(src[pos]!)) throw error('invalid decimal literal');
      push('number', src.slice(start, pos), start - lineStart);
      continue;
    }

    if (ch === "'" || ch === '"') {
      pos = readString(false, pos);
      continue;
    }

    const op = OPERATORS.find((candidate) => src.startsWith(candidate, pos));
    if (op) {
      if (OPENING_BRACKETS.has(op)) bracketDepth++;
      if (CLOSING_BRACKETS.has(op)) {
        if (bracketDepth === 0) throw error(`unmatched '${op}'`);
        bracketDepth--;
      }
      push('op', op);
      pos += op.length;
      continue;
    }

    throw error(`invalid character '${ch}'`);
  }

  if (bracketDepth > 0) throw error('unexpected end of file inside brackets');
  const last = tokens[tokens.length - 1];
  if (last && last.type !== 'newline' && last.type !== 'dedent') push('newline', '');
  while (indentStack.length > 1) {
    indentStack.pop();
    push('dedent', '', 0);
  }
  push('eof', '');
  return tokens;

  /** Reads a string literal starting at `start` (prefix included) and returns the position after it. */
  function readString(raw: boolean, start: number): number {
    let p = raw ? start + 1 : start;
    const quote = src[p]!;
    const triple = src.startsWith(quote.repeat(3), p);
    const startLine = line;
    const startCol = start - lineStart;
    p += triple ? 3 : 1;
    let value = '';
    for (;;) {
      if (p >= src.length) throw new PyError('SyntaxError', 'unterminated string literal', startLine);
      const c = src[p]!;
      if (triple ? src.startsWith(quote.repeat(3), p) : c === quote) {
        p += triple ? 3 : 1;
        break;
      }
      if (c === '\n') {
        if (!triple) throw new PyError('SyntaxError', 'unterminated string literal', startLine);
        line++;
        lineStart = p + 1;
      }
      if (c === '\\' && !raw) {
        const next = src[p + 1] ?? '';
        const escaped = ESCAPES[next];
        if (next === '\n') {
          line++;
          lineStart = p + 2;
        }
        value += escaped ?? `\\${next}`;
        p += 2;
        continue;
      }
      value += c;
      p++;
    }
    tokens.push({ type: 'string', value, line: startLine, col: startCol });
    return p;
  }
}
