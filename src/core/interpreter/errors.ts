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
  | 'RuntimeError'
  | 'ImportError'
  /** A language feature or function the player has not unlocked yet. */
  | 'LockedError';

/** A Python-level error raised while compiling or running player code. */
export class PyError extends Error {
  readonly pyType: PyErrorType;
  line: number | null;
  /** Code file the error happened in; null for the file that was run (or when unknown). */
  file: string | null;

  constructor(pyType: PyErrorType, message: string, line: number | null = null, file: string | null = null) {
    super(message);
    this.name = pyType;
    this.pyType = pyType;
    this.line = line;
    this.file = file;
  }

  format(): string {
    const where = this.line === null ? null : this.file === null ? `line ${this.line}` : `${this.file}, line ${this.line}`;
    return `${this.pyType}: ${this.message}${where === null ? '' : ` (${where})`}`;
  }
}
