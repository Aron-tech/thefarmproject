import type { BinaryOperator, UnaryOperator } from './ast.ts';
import { PyError } from './errors.ts';
import {
  expectInt,
  hashKey,
  isIntLike,
  isNumber,
  isTruthy,
  iterate,
  numberValue,
  pyBool,
  pyEquals,
  pyFloat,
  pyInt,
  pyList,
  pyStr,
  pyTuple,
  rangeLength,
  repr,
  typeName,
  type PyNumber,
  type PyValue,
} from './values.ts';

/** Largest sequence a `*` repetition may create, to keep a typo from exhausting memory. */
const MAX_SEQUENCE_LENGTH = 10_000_000;

function unsupported(op: string, a: PyValue, b: PyValue): PyError {
  return new PyError('TypeError', `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`);
}

function repeat<T>(items: readonly T[], times: number): T[] {
  if (times <= 0) return [];
  if (items.length * times > MAX_SEQUENCE_LENGTH) throw new PyError('ValueError', 'sequence too large');
  const result: T[] = [];
  for (let i = 0; i < times; i++) result.push(...items);
  return result;
}

function floorMod(a: number, b: number): number {
  return a - b * Math.floor(a / b);
}

export function binaryOp(op: BinaryOperator, a: PyValue, b: PyValue): PyValue {
  if (isNumber(a) && isNumber(b)) return numericOp(op, a, b);

  if (op === '+') {
    if (a.type === 'str' && b.type === 'str') return pyStr(a.value + b.value);
    if (a.type === 'list' && b.type === 'list') return pyList([...a.items, ...b.items]);
    if (a.type === 'tuple' && b.type === 'tuple') return pyTuple([...a.items, ...b.items]);
  }
  if (op === '*') {
    const [seq, count] = isIntLike(a) ? [b, a] : [a, b];
    if (isIntLike(count)) {
      const times = numberValue(count);
      if (seq.type === 'str') {
        if (seq.value.length * Math.max(0, times) > MAX_SEQUENCE_LENGTH) throw new PyError('ValueError', 'string too large');
        return pyStr(times > 0 ? seq.value.repeat(times) : '');
      }
      if (seq.type === 'list') return pyList(repeat(seq.items, times));
      if (seq.type === 'tuple') return pyTuple(repeat(seq.items, times));
    }
  }
  if (op === '|' && a.type === 'set' && b.type === 'set') {
    return { type: 'set', entries: new Map([...a.entries, ...b.entries]) };
  }
  if (op === '&' && a.type === 'set' && b.type === 'set') {
    return { type: 'set', entries: new Map([...a.entries].filter(([key]) => b.entries.has(key))) };
  }
  if (op === '-' && a.type === 'set' && b.type === 'set') {
    return { type: 'set', entries: new Map([...a.entries].filter(([key]) => !b.entries.has(key))) };
  }
  throw unsupported(op, a, b);
}

function numericOp(op: BinaryOperator, a: PyNumber, b: PyNumber): PyValue {
  const x = numberValue(a);
  const y = numberValue(b);
  const bothInt = isIntLike(a) && isIntLike(b);
  const num = (value: number) => (bothInt ? pyInt(value) : pyFloat(value));

  switch (op) {
    case '+':
      return num(x + y);
    case '-':
      return num(x - y);
    case '*':
      return num(x * y);
    case '/':
      if (y === 0) throw new PyError('ZeroDivisionError', 'division by zero');
      return pyFloat(x / y);
    case '//':
      if (y === 0) throw new PyError('ZeroDivisionError', 'integer division or modulo by zero');
      return num(Math.floor(x / y));
    case '%':
      if (y === 0) throw new PyError('ZeroDivisionError', 'integer modulo by zero');
      return num(floorMod(x, y));
    case '**':
      if (x === 0 && y < 0) throw new PyError('ZeroDivisionError', '0.0 cannot be raised to a negative power');
      return bothInt && y >= 0 ? pyInt(x ** y) : pyFloat(x ** y);
  }

  if (!bothInt) throw unsupported(op, a, b);
  switch (op) {
    case '<<':
      if (y < 0) throw new PyError('ValueError', 'negative shift count');
      return pyInt(x * 2 ** y);
    case '>>':
      if (y < 0) throw new PyError('ValueError', 'negative shift count');
      return pyInt(Math.floor(x / 2 ** y));
    case '&':
      return pyInt(Number(BigInt(x) & BigInt(y)));
    case '|':
      return pyInt(Number(BigInt(x) | BigInt(y)));
    case '^':
      return pyInt(Number(BigInt(x) ^ BigInt(y)));
  }
}

export function unaryOp(op: UnaryOperator, value: PyValue): PyValue {
  if (op === 'not') return pyBool(!isTruthy(value));
  if (!isNumber(value)) throw new PyError('TypeError', `bad operand type for unary ${op}: '${typeName(value)}'`);
  const x = numberValue(value);
  switch (op) {
    case '-':
      return value.type === 'float' ? pyFloat(-x) : pyInt(-x);
    case '+':
      return value.type === 'float' ? value : pyInt(x);
    case '~':
      if (value.type === 'float') throw new PyError('TypeError', "bad operand type for unary ~: 'float'");
      return pyInt(-x - 1);
  }
}

export function contains(container: PyValue, item: PyValue): boolean {
  switch (container.type) {
    case 'str':
      if (item.type !== 'str') {
        throw new PyError('TypeError', `'in <string>' requires string as left operand, not ${typeName(item)}`);
      }
      return container.value.includes(item.value);
    case 'dict':
      return container.entries.has(hashKey(item));
    case 'set':
      return container.entries.has(hashKey(item));
    case 'range': {
      if (!isIntLike(item)) return false;
      const n = numberValue(item);
      const { start, stop, step } = container;
      const inBounds = step > 0 ? n >= start && n < stop : n <= start && n > stop;
      return inBounds && (n - start) % step === 0;
    }
    default:
      for (const element of iterate(container)) {
        if (pyEquals(element, item)) return true;
      }
      return false;
  }
}

/** Resolves a possibly negative index against a sequence length. */
export function normalizeIndex(index: PyValue, length: number, what: string): number {
  const raw = expectInt(index, `${what} indices`);
  const resolved = raw < 0 ? raw + length : raw;
  if (resolved < 0 || resolved >= length) throw new PyError('IndexError', `${what} index out of range`);
  return resolved;
}

export function getItem(container: PyValue, index: PyValue): PyValue {
  switch (container.type) {
    case 'list':
      return container.items[normalizeIndex(index, container.items.length, 'list')]!;
    case 'tuple':
      return container.items[normalizeIndex(index, container.items.length, 'tuple')]!;
    case 'str':
      return pyStr([...container.value][normalizeIndex(index, [...container.value].length, 'string')]!);
    case 'range': {
      const i = normalizeIndex(index, rangeLength(container), 'range object');
      return pyInt(container.start + i * container.step);
    }
    case 'dict': {
      const entry = container.entries.get(hashKey(index));
      if (!entry) throw new PyError('KeyError', repr(index));
      return entry[1];
    }
    default:
      throw new PyError('TypeError', `'${typeName(container)}' object is not subscriptable`);
  }
}

export function setItem(container: PyValue, index: PyValue, value: PyValue): void {
  if (container.type === 'list') {
    container.items[normalizeIndex(index, container.items.length, 'list assignment')] = value;
    return;
  }
  if (container.type === 'dict') {
    container.entries.set(hashKey(index), [index, value]);
    return;
  }
  throw new PyError('TypeError', `'${typeName(container)}' object does not support item assignment`);
}

/** Computes the indices selected by a slice, following Python's clamping rules. */
function sliceIndices(length: number, lower: PyValue, upper: PyValue, stepValue: PyValue): number[] {
  const step = stepValue.type === 'none' ? 1 : expectInt(stepValue, 'slice');
  if (step === 0) throw new PyError('ValueError', 'slice step cannot be zero');
  const clamp = (value: PyValue, fallback: number): number => {
    if (value.type === 'none') return fallback;
    let n = expectInt(value, 'slice');
    if (n < 0) n += length;
    return step > 0 ? Math.min(Math.max(n, 0), length) : Math.min(Math.max(n, -1), length - 1);
  };
  const start = clamp(lower, step > 0 ? 0 : length - 1);
  const stop = clamp(upper, step > 0 ? length : -1);
  const indices: number[] = [];
  for (let i = start; step > 0 ? i < stop : i > stop; i += step) indices.push(i);
  return indices;
}

export function getSlice(container: PyValue, lower: PyValue, upper: PyValue, step: PyValue): PyValue {
  switch (container.type) {
    case 'list':
      return pyList(sliceIndices(container.items.length, lower, upper, step).map((i) => container.items[i]!));
    case 'tuple':
      return pyTuple(sliceIndices(container.items.length, lower, upper, step).map((i) => container.items[i]!));
    case 'str': {
      const chars = [...container.value];
      return pyStr(sliceIndices(chars.length, lower, upper, step).map((i) => chars[i]!).join(''));
    }
    default:
      throw new PyError('TypeError', `'${typeName(container)}' object is not subscriptable`);
  }
}
