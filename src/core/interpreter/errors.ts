export type PyErrorType =
  | 'SyntaxError'
  | 'IndentationError'
  | 'NameError'
  | 'UnboundLocalError'
  | 'TypeError'
  | 'ValueError'
  | 'IndexError'
  | 'KeyError'
  | 'AttributeError'
  | 'ZeroDivisionError'
  | 'RecursionError'
  | 'RuntimeError';

/** A Python-level error raised while compiling or running player code. */
export class PyError extends Error {
  readonly pyType: PyErrorType;
  line: number | null;

  constructor(pyType: PyErrorType, message: string, line: number | null = null) {
    super(message);
    this.name = pyType;
    this.pyType = pyType;
    this.line = line;
  }

  format(): string {
    const location = this.line === null ? '' : ` (line ${this.line})`;
    return `${this.pyType}: ${this.message}${location}`;
  }
}
