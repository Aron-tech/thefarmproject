import type { UnlockLevels } from '../state/types.ts';
import type { Module } from './ast.ts';
import { createCoreBuiltins } from './builtins.ts';
import { PyError } from './errors.ts';
import { DEFAULT_FILE_NAME, Interpreter } from './evaluator.ts';
import { createGameBuiltins } from './gameApi.ts';
import { parse } from './parser.ts';
import { checkUnlocks } from './unlockCheck.ts';
import type { PyValue } from './values.ts';

let gameBuiltins: ReadonlyMap<string, PyValue> | null = null;

/** Core Python builtins plus the game API; built once since builtins are immutable. */
export function getGameBuiltins(): ReadonlyMap<string, PyValue> {
  if (!gameBuiltins) {
    const builtins = new Map([...createCoreBuiltins(), ...createGameBuiltins()]);
    const print = builtins.get('print');
    if (print) builtins.set('quick_print', print);
    gameBuiltins = builtins;
  }
  return gameBuiltins;
}

export interface ProgramOptions {
  getTickCount: () => number;
  /** Locked features are rejected when given; without it everything is available. */
  unlocks?: UnlockLevels;
  /** Name of the file being run. */
  fileName?: string;
  /** Source of every code file by name, for `import`. */
  files?: Readonly<Record<string, string>>;
}

function compile(source: string, unlocks: UnlockLevels | undefined): Module {
  const module = parse(source);
  if (unlocks) checkUnlocks(module, unlocks);
  return module;
}

/**
 * Parses player code and creates an interpreter for it. Throws a PyError on syntax errors and
 * locked features. Imported files are compiled when first imported; their errors name the file.
 */
export function createGameInterpreter(source: string, options: ProgramOptions): Interpreter {
  const { unlocks, files = {} } = options;
  const resolveModule = (name: string): Module => {
    const moduleSource = Object.hasOwn(files, name) ? files[name] : undefined;
    if (moduleSource === undefined) throw new PyError('ImportError', `no code file named '${name}'`);
    try {
      return compile(moduleSource, unlocks);
    } catch (error) {
      if (error instanceof PyError && error.file === null) error.file = name;
      throw error;
    }
  };
  return new Interpreter(compile(source, unlocks), {
    builtins: getGameBuiltins(),
    getTickCount: options.getTickCount,
    fileName: options.fileName ?? DEFAULT_FILE_NAME,
    resolveModule,
  });
}
