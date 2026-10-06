import type { ActionResult, DroneAction } from '../state/types.ts';
import type { Expr, Param, Stmt } from './ast.ts';
import { PyError } from './errors.ts';

// ---------------------------------------------------------------- execution signals

/**
 * Values yielded by the evaluator to its scheduler:
 * - a positive number: a statement is about to run on that line (costs one tick; step/breakpoint point)
 * - OP_SIGNAL: an expression-level operation (costs one tick)
 * - an action / print request
 */
export type Signal = number | { kind: 'action'; action: DroneAction } | { kind: 'print'; text: string };
export const OP_SIGNAL = 0;

/** Value sent back into the generator: the result of an action request, otherwise undefined. */
export type ResumeValue = ActionResult | undefined;
export type Gen<T> = Generator<Signal, T, ResumeValue>;

// ---------------------------------------------------------------- scopes

export class Scope {
  readonly vars = new Map<string, PyValue>();
  readonly parent: Scope | null;
  /** null for the module (global) scope, where every name is global. */
  readonly localNames: ReadonlySet<string> | null;
  readonly globalNames: ReadonlySet<string>;

  constructor(parent: Scope | null, localNames: ReadonlySet<string> | null, globalNames: ReadonlySet<string>) {
    this.parent = parent;
    this.localNames = localNames;
    this.globalNames = globalNames;
  }
}

// ---------------------------------------------------------------- value types

export interface CallContext {
  callValue(fn: PyValue, args: PyValue[], kwargs: Map<string, PyValue>): Gen<PyValue>;
  getTickCount(): number;
}

/** A native function: plain ones return a value, ones that call back into Python or request actions return a generator. */
export type BuiltinImpl = (args: PyValue[], kwargs: Map<string, PyValue>, ctx: CallContext) => PyValue | Gen<PyValue>;

export interface PyNone { type: 'none' }
export interface PyBool { type: 'bool'; value: boolean }
export interface PyInt { type: 'int'; value: number }
export interface PyFloat { type: 'float'; value: number }
export interface PyStr { type: 'str'; value: string }
export interface PyList { type: 'list'; items: PyValue[] }
export interface PyTuple { type: 'tuple'; items: readonly PyValue[] }
export interface PyDict { type: 'dict'; entries: Map<string, [PyValue, PyValue]> }
export interface PySet { type: 'set'; entries: Map<string, PyValue> }
export interface PyRange { type: 'range'; start: number; stop: number; step: number }
export interface PyFunction {
  type: 'function';
  name: string;
  params: Param[];
  defaults: (PyValue | null)[];
  body: Stmt[] | Expr;
  localNames: ReadonlySet<string>;
  globalNames: ReadonlySet<string>;
  closure: Scope;
  /** Code file the function was defined in, for error and breakpoint locations. */
  file: string;
}
export interface PyBuiltin { type: 'builtin'; name: string; call: BuiltinImpl }
export interface PyEnum { type: 'enum'; group: string; member: string; repr: string }
export interface PyNamespace { type: 'namespace'; name: string; members: ReadonlyMap<string, PyValue> }
/** An imported code file; its attributes are the file's global variables. */
export interface PyModule { type: 'module'; name: string; scope: Scope }

export type PyValue =
  | PyNone
  | PyBool
  | PyInt
  | PyFloat
  | PyStr
  | PyList
  | PyTuple
  | PyDict
  | PySet
  | PyRange
  | PyFunction
  | PyBuiltin
  | PyEnum
  | PyNamespace
  | PyModule;

export type PyNumber = PyBool | PyInt | PyFloat;

export const NONE: PyNone = { type: 'none' };
export const TRUE: PyBool = { type: 'bool', value: true };
export const FALSE: PyBool = { type: 'bool', value: false };

export const pyBool = (value: boolean): PyBool => (value ? TRUE : FALSE);
export const pyInt = (value: number): PyInt => ({ type: 'int', value });
export const pyFloat = (value: number): PyFloat => ({ type: 'float', value });
export const pyStr = (value: string): PyStr => ({ type: 'str', value });
export const pyList = (items: PyValue[]): PyList => ({ type: 'list', items });
export const pyTuple = (items: readonly PyValue[]): PyTuple => ({ type: 'tuple', items });

export function pyDict(pairs: Iterable<[PyValue, PyValue]> = []): PyDict {
  const entries = new Map<string, [PyValue, PyValue]>();
  for (const [key, value] of pairs) entries.set(hashKey(key), [key, value]);
  return { type: 'dict', entries };
}

export function pySet(items: Iterable<PyValue> = []): PySet {
  const entries = new Map<string, PyValue>();
  for (const item of items) entries.set(hashKey(item), item);
  return { type: 'set', entries };
}

export function pyBuiltin(name: string, call: BuiltinImpl): PyBuiltin {
  return { type: 'builtin', name, call };
}

// ---------------------------------------------------------------- inspection helpers

export function typeName(value: PyValue): string {
  switch (value.type) {
    case 'none':
      return 'NoneType';
    case 'builtin':
      return 'builtin_function_or_method';
    case 'enum':
      return value.group;
    default:
      return value.type;
  }
}

export function isNumber(value: PyValue): value is PyNumber {
  return value.type === 'int' || value.type === 'float' || value.type === 'bool';
}

/** True for int and bool, which behave as integers in arithmetic. */
export function isIntLike(value: PyValue): value is PyInt | PyBool {
  return value.type === 'int' || value.type === 'bool';
}

export function numberValue(value: PyNumber): number {
  return value.type === 'bool' ? (value.value ? 1 : 0) : value.value;
}

export function expectInt(value: PyValue, what: string): number {
  if (!isIntLike(value)) throw new PyError('TypeError', `${what} must be an integer, not ${typeName(value)}`);
  return numberValue(value);
}

export function isTruthy(value: PyValue): boolean {
  switch (value.type) {
    case 'none':
      return false;
    case 'bool':
      return value.value;
    case 'int':
    case 'float':
      return value.value !== 0;
    case 'str':
      return value.value.length > 0;
    case 'list':
    case 'tuple':
      return value.items.length > 0;
    case 'dict':
    case 'set':
      return value.entries.size > 0;
    case 'range':
      return rangeLength(value) > 0;
    default:
      return true;
  }
}

export function rangeLength(range: PyRange): number {
  const span = range.step > 0 ? range.stop - range.start : range.start - range.stop;
  return Math.max(0, Math.ceil(span / Math.abs(range.step)));
}

/** Hash key used for dict / set storage; numbers that compare equal share a key, like in Python. */
export function hashKey(value: PyValue): string {
  switch (value.type) {
    case 'none':
      return 'None';
    case 'bool':
    case 'int':
    case 'float':
      return `n:${numberValue(value)}`;
    case 'str':
      return `s:${value.value}`;
    case 'tuple':
      return `t:(${value.items.map(hashKey).join(',')})`;
    case 'enum':
      return `e:${value.group}.${value.member}`;
    case 'function':
    case 'builtin':
    case 'namespace':
    case 'module':
      return `o:${objectId(value)}`;
    default:
      throw new PyError('TypeError', `unhashable type: '${typeName(value)}'`);
  }
}

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
function objectId(value: object): number {
  let id = objectIds.get(value);
  if (id === undefined) {
    id = nextObjectId++;
    objectIds.set(value, id);
  }
  return id;
}

// ---------------------------------------------------------------- equality & ordering

export function pyEquals(a: PyValue, b: PyValue): boolean {
  if (isNumber(a) && isNumber(b)) return numberValue(a) === numberValue(b);
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'none':
      return true;
    case 'str':
      return a.value === (b as PyStr).value;
    case 'list':
    case 'tuple': {
      const other = (b as PyList | PyTuple).items;
      return a.items.length === other.length && a.items.every((item, i) => pyEquals(item, other[i]!));
    }
    case 'dict': {
      const other = (b as PyDict).entries;
      if (a.entries.size !== other.size) return false;
      for (const [key, [, value]] of a.entries) {
        const entry = other.get(key);
        if (!entry || !pyEquals(value, entry[1])) return false;
      }
      return true;
    }
    case 'set': {
      const other = (b as PySet).entries;
      return a.entries.size === other.size && [...a.entries.keys()].every((key) => other.has(key));
    }
    case 'range': {
      const r = b as PyRange;
      return a.start === r.start && a.stop === r.stop && a.step === r.step;
    }
    case 'enum':
      return a.group === (b as PyEnum).group && a.member === (b as PyEnum).member;
    default:
      return a === b;
  }
}

/** Python's `is`: identity, with singletons and enums treated as identical when equal. */
export function pyIs(a: PyValue, b: PyValue): boolean {
  if (a === b) return true;
  if (a.type === 'none' || a.type === 'bool' || a.type === 'enum') return a.type === b.type && pyEquals(a, b);
  return false;
}

/** Three-way comparison for `<`, `>`, sorting, min and max. */
export function compareValues(a: PyValue, b: PyValue, op = '<'): number {
  if (isNumber(a) && isNumber(b)) return numberValue(a) - numberValue(b);
  if (a.type === 'str' && b.type === 'str') return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  if ((a.type === 'list' && b.type === 'list') || (a.type === 'tuple' && b.type === 'tuple')) {
    const left = a.items;
    const right = (b as PyList | PyTuple).items;
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      if (!pyEquals(left[i]!, right[i]!)) return compareValues(left[i]!, right[i]!, op);
    }
    return left.length - right.length;
  }
  throw new PyError(
    'TypeError',
    `'${op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`,
  );
}

// ---------------------------------------------------------------- iteration

export function* iterate(value: PyValue): Generator<PyValue, void, undefined> {
  switch (value.type) {
    case 'list':
      // Indexed loop so that appends during iteration are seen, as in Python.
      for (let i = 0; i < value.items.length; i++) yield value.items[i]!;
      return;
    case 'tuple':
      yield* value.items;
      return;
    case 'str':
      for (const ch of value.value) yield pyStr(ch);
      return;
    case 'range':
      for (let i = value.start; value.step > 0 ? i < value.stop : i > value.stop; i += value.step) yield pyInt(i);
      return;
    case 'dict':
      for (const [key] of [...value.entries.values()]) yield key;
      return;
    case 'set':
      yield* [...value.entries.values()];
      return;
    default:
      throw new PyError('TypeError', `'${typeName(value)}' object is not iterable`);
  }
}

export function toArray(value: PyValue): PyValue[] {
  return [...iterate(value)];
}

// ---------------------------------------------------------------- string conversion

export function formatFloat(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
  if (Number.isInteger(value) && Math.abs(value) < 1e16) return value.toFixed(1);
  return String(value);
}

function formatInt(value: number): string {
  return Math.abs(value) >= 1e21 && Number.isFinite(value) ? BigInt(value).toString() : String(value);
}

function quoteString(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
  return quote + (quote === "'" ? escaped.replace(/'/g, "\\'") : escaped) + quote;
}

export function repr(value: PyValue): string {
  switch (value.type) {
    case 'none':
      return 'None';
    case 'bool':
      return value.value ? 'True' : 'False';
    case 'int':
      return formatInt(value.value);
    case 'float':
      return formatFloat(value.value);
    case 'str':
      return quoteString(value.value);
    case 'list':
      return `[${value.items.map(repr).join(', ')}]`;
    case 'tuple':
      return value.items.length === 1 ? `(${repr(value.items[0]!)},)` : `(${value.items.map(repr).join(', ')})`;
    case 'dict':
      return `{${[...value.entries.values()].map(([k, v]) => `${repr(k)}: ${repr(v)}`).join(', ')}}`;
    case 'set':
      return value.entries.size === 0 ? 'set()' : `{${[...value.entries.values()].map(repr).join(', ')}}`;
    case 'range':
      return value.step === 1 ? `range(${value.start}, ${value.stop})` : `range(${value.start}, ${value.stop}, ${value.step})`;
    case 'function':
      return `<function ${value.name}>`;
    case 'builtin':
      return `<built-in function ${value.name}>`;
    case 'enum':
      return value.repr;
    case 'namespace':
      return `<namespace ${value.name}>`;
    case 'module':
      return `<module '${value.name}'>`;
  }
}

export function str(value: PyValue): string {
  return value.type === 'str' ? value.value : repr(value);
}
