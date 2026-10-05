import { createCoreBuiltins } from './builtins.ts';
import { Interpreter } from './evaluator.ts';
import { createGameBuiltins } from './gameApi.ts';
import { parse } from './parser.ts';
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

/** Parses player code and creates an interpreter for it. Throws a PyError on syntax errors. */
export function createGameInterpreter(source: string, getTickCount: () => number): Interpreter {
  return new Interpreter(parse(source), { builtins: getGameBuiltins(), getTickCount });
}
