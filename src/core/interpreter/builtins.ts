import { PyError } from './errors.ts';
import { binaryOp, normalizeIndex } from './operations.ts';
import {
  compareValues,
  expectInt,
  FALSE,
  formatFloat,
  hashKey,
  isIntLike,
  isNumber,
  isTruthy,
  iterate,
  NONE,
  numberValue,
  pyBool,
  pyBuiltin,
  pyDict,
  pyFloat,
  pyEquals,
  pyInt,
  pyList,
  pySet,
  pyStr,
  pyTuple,
  repr,
  str,
  toArray,
  TRUE,
  typeName,
  type CallContext,
  type Gen,
  type PyValue,
} from './values.ts';


export function checkArgCount(name: string, args: PyValue[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    const expected = min === max ? `${min}` : max === Infinity ? `at least ${min}` : `${min} to ${max}`;
    throw new PyError('TypeError', `${name}() takes ${expected} argument(s) (${args.length} given)`);
  }
}

function checkNoKwargs(name: string, kwargs: ReadonlyMap<string, PyValue>, allowed: readonly string[] = []): void {
  for (const key of kwargs.keys()) {
    if (!allowed.includes(key)) throw new PyError('TypeError', `${name}() got an unexpected keyword argument '${key}'`);
  }
}

function roundHalfEven(x: number): number {
  return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x);
}

/** Stable sort with an optional Python key function. */
function* sortValues(items: PyValue[], key: PyValue, reverse: boolean, ctx: CallContext): Gen<PyValue[]> {
  const keyed: { item: PyValue; key: PyValue }[] = [];
  for (const item of items) {
    keyed.push({ item, key: key.type === 'none' ? item : yield* ctx.callValue(key, [item], new Map()) });
  }
  keyed.sort((a, b) => compareValues(a.key, b.key));
  if (reverse) keyed.reverse();
  return keyed.map((entry) => entry.item);
}

function* extreme(name: 'min' | 'max', args: PyValue[], kwargs: Map<string, PyValue>, ctx: CallContext): Gen<PyValue> {
  checkNoKwargs(name, kwargs, ['key']);
  checkArgCount(name, args, 1, Infinity);
  const items = args.length === 1 ? toArray(args[0]!) : args;
  if (items.length === 0) throw new PyError('ValueError', `${name}() arg is an empty sequence`);
  const key = kwargs.get('key') ?? NONE;
  let best = items[0]!;
  let bestKey = key.type === 'none' ? best : yield* ctx.callValue(key, [best], new Map());
  for (const item of items.slice(1)) {
    const itemKey = key.type === 'none' ? item : yield* ctx.callValue(key, [item], new Map());
    const cmp = compareValues(itemKey, bestKey);
    if (name === 'min' ? cmp < 0 : cmp > 0) {
      best = item;
      bestKey = itemKey;
    }
  }
  return best;
}

function toInt(value: PyValue): PyValue {
  if (isIntLike(value)) return pyInt(numberValue(value));
  if (value.type === 'float') {
    if (!Number.isFinite(value.value)) throw new PyError('ValueError', `cannot convert float ${formatFloat(value.value)} to integer`);
    return pyInt(Math.trunc(value.value));
  }
  if (value.type === 'str') {
    const text = value.value.trim().replace(/_/g, '');
    if (!/^[+-]?\d+$/.test(text)) throw new PyError('ValueError', `invalid literal for int() with base 10: ${repr(value)}`);
    return pyInt(parseInt(text, 10));
  }
  throw new PyError('TypeError', `int() argument must be a string or a number, not '${typeName(value)}'`);
}

function toFloat(value: PyValue): PyValue {
  if (isNumber(value)) return pyFloat(numberValue(value));
  if (value.type === 'str') {
    const text = value.value.trim().toLowerCase();
    const special: Record<string, number> = { inf: Infinity, '+inf': Infinity, '-inf': -Infinity, nan: NaN };
    const parsed = text in special ? special[text]! : text === '' ? NaN : Number(text);
    if (Number.isNaN(parsed) && text !== 'nan') {
      throw new PyError('ValueError', `could not convert string to float: ${repr(value)}`);
    }
    return pyFloat(parsed);
  }
  throw new PyError('TypeError', `float() argument must be a string or a number, not '${typeName(value)}'`);
}

function length(value: PyValue): number {
  switch (value.type) {
    case 'str':
      return [...value.value].length;
    case 'list':
    case 'tuple':
      return value.items.length;
    case 'dict':
    case 'set':
      return value.entries.size;
    case 'range':
      return toArray(value).length;
    default:
      throw new PyError('TypeError', `object of type '${typeName(value)}' has no len()`);
  }
}

/** Core Python builtins available to every program. */
export function createCoreBuiltins(): Map<string, PyValue> {
  const builtins = new Map<string, PyValue>();
  const define = (name: string, impl: Parameters<typeof pyBuiltin>[1]) => builtins.set(name, pyBuiltin(name, impl));

  define('print', function* (args, kwargs) {
    checkNoKwargs('print', kwargs, ['sep', 'end']);
    const sep = kwargs.get('sep');
    const text = args.map(str).join(sep && sep.type !== 'none' ? str(sep) : ' ');
    yield { kind: 'print', text };
    return NONE;
  });
  define('range', (args, kwargs) => {
    checkNoKwargs('range', kwargs);
    checkArgCount('range', args, 1, 3);
    const nums = args.map((a) => expectInt(a, 'range() arguments'));
    const [start, stop, step] = nums.length === 1 ? [0, nums[0]!, 1] : [nums[0]!, nums[1]!, nums[2] ?? 1];
    if (step === 0) throw new PyError('ValueError', 'range() arg 3 must not be zero');
    return { type: 'range', start, stop, step };
  });
  define('len', (args) => {
    checkArgCount('len', args, 1);
    return pyInt(length(args[0]!));
  });
  define('abs', (args) => {
    checkArgCount('abs', args, 1);
    const value = args[0]!;
    if (!isNumber(value)) throw new PyError('TypeError', `bad operand type for abs(): '${typeName(value)}'`);
    return value.type === 'float' ? pyFloat(Math.abs(value.value)) : pyInt(Math.abs(numberValue(value)));
  });
  define('min', (args, kwargs, ctx) => extreme('min', args, kwargs, ctx));
  define('max', (args, kwargs, ctx) => extreme('max', args, kwargs, ctx));
  define('sum', (args) => {
    checkArgCount('sum', args, 1, 2);
    let total: PyValue = args[1] ?? pyInt(0);
    for (const item of iterate(args[0]!)) total = binaryOp('+', total, item);
    return total;
  });
  define('pow', (args) => {
    checkArgCount('pow', args, 2);
    return binaryOp('**', args[0]!, args[1]!);
  });
  define('round', (args) => {
    checkArgCount('round', args, 1, 2);
    const value = args[0]!;
    if (!isNumber(value)) throw new PyError('TypeError', `type ${typeName(value)} doesn't define __round__ method`);
    const x = numberValue(value);
    const ndigits = args[1];
    if (ndigits === undefined || ndigits.type === 'none') return pyInt(roundHalfEven(x));
    const factor = 10 ** expectInt(ndigits, 'ndigits');
    const rounded = roundHalfEven(x * factor) / factor;
    return value.type === 'float' ? pyFloat(rounded) : pyInt(rounded);
  });
  define('int', (args) => {
    checkArgCount('int', args, 0, 1);
    return args[0] ? toInt(args[0]) : pyInt(0);
  });
  define('float', (args) => {
    checkArgCount('float', args, 0, 1);
    return args[0] ? toFloat(args[0]) : pyFloat(0);
  });
  define('str', (args) => {
    checkArgCount('str', args, 0, 1);
    return pyStr(args[0] ? str(args[0]) : '');
  });
  define('bool', (args) => {
    checkArgCount('bool', args, 0, 1);
    return args[0] ? pyBool(isTruthy(args[0])) : FALSE;
  });
  define('list', (args) => {
    checkArgCount('list', args, 0, 1);
    return pyList(args[0] ? toArray(args[0]) : []);
  });
  define('tuple', (args) => {
    checkArgCount('tuple', args, 0, 1);
    return pyTuple(args[0] ? toArray(args[0]) : []);
  });
  define('set', (args) => {
    checkArgCount('set', args, 0, 1);
    return pySet(args[0] ? iterate(args[0]) : []);
  });
  define('dict', (args, kwargs) => {
    checkArgCount('dict', args, 0, 1);
    const pairs: [PyValue, PyValue][] = [];
    if (args[0]) {
      const source = args[0];
      if (source.type === 'dict') {
        pairs.push(...source.entries.values());
      } else {
        for (const pair of iterate(source)) {
          const items = toArray(pair);
          if (items.length !== 2) throw new PyError('ValueError', 'dictionary update sequence element has wrong length');
          pairs.push([items[0]!, items[1]!]);
        }
      }
    }
    for (const [key, value] of kwargs) pairs.push([pyStr(key), value]);
    return pyDict(pairs);
  });
  define('sorted', function* (args, kwargs, ctx) {
    checkNoKwargs('sorted', kwargs, ['key', 'reverse']);
    checkArgCount('sorted', args, 1);
    const reverse = isTruthy(kwargs.get('reverse') ?? FALSE);
    return pyList(yield* sortValues(toArray(args[0]!), kwargs.get('key') ?? NONE, reverse, ctx));
  });
  define('reversed', (args) => {
    checkArgCount('reversed', args, 1);
    return pyList(toArray(args[0]!).reverse());
  });
  define('enumerate', (args) => {
    checkArgCount('enumerate', args, 1, 2);
    const start = args[1] ? expectInt(args[1], 'enumerate start') : 0;
    return pyList(toArray(args[0]!).map((item, i) => pyTuple([pyInt(start + i), item])));
  });
  define('zip', (args) => {
    const lists = args.map(toArray);
    const count = lists.length === 0 ? 0 : Math.min(...lists.map((l) => l.length));
    const result: PyValue[] = [];
    for (let i = 0; i < count; i++) result.push(pyTuple(lists.map((l) => l[i]!)));
    return pyList(result);
  });
  define('any', (args) => {
    checkArgCount('any', args, 1);
    for (const item of iterate(args[0]!)) if (isTruthy(item)) return TRUE;
    return FALSE;
  });
  define('all', (args) => {
    checkArgCount('all', args, 1);
    for (const item of iterate(args[0]!)) if (!isTruthy(item)) return FALSE;
    return TRUE;
  });

  return builtins;
}

// ---------------------------------------------------------------- attribute access / methods

type MethodImpl = (self: PyValue, args: PyValue[], kwargs: Map<string, PyValue>, ctx: CallContext) => PyValue | Gen<PyValue>;

function indexOf(items: readonly PyValue[], value: PyValue, what: string): number {
  const index = items.findIndex((item) => pyEquals(item, value));
  if (index < 0) throw new PyError('ValueError', `${repr(value)} is not in ${what}`);
  return index;
}

const LIST_METHODS: Record<string, MethodImpl> = {
  append: (self, args) => {
    checkArgCount('append', args, 1);
    (self as { items: PyValue[] }).items.push(args[0]!);
    return NONE;
  },
  extend: (self, args) => {
    checkArgCount('extend', args, 1);
    (self as { items: PyValue[] }).items.push(...toArray(args[0]!));
    return NONE;
  },
  insert: (self, args) => {
    checkArgCount('insert', args, 2);
    const items = (self as { items: PyValue[] }).items;
    let index = expectInt(args[0]!, 'list indices');
    if (index < 0) index = Math.max(0, index + items.length);
    items.splice(Math.min(index, items.length), 0, args[1]!);
    return NONE;
  },
  pop: (self, args) => {
    checkArgCount('pop', args, 0, 1);
    const items = (self as { items: PyValue[] }).items;
    if (items.length === 0) throw new PyError('IndexError', 'pop from empty list');
    const index = args[0] ? normalizeIndex(args[0], items.length, 'pop') : items.length - 1;
    return items.splice(index, 1)[0]!;
  },
  remove: (self, args) => {
    checkArgCount('remove', args, 1);
    const items = (self as { items: PyValue[] }).items;
    items.splice(indexOf(items, args[0]!, 'list'), 1);
    return NONE;
  },
  index: (self, args) => {
    checkArgCount('index', args, 1);
    return pyInt(indexOf((self as { items: PyValue[] }).items, args[0]!, 'list'));
  },
  count: (self, args) => {
    checkArgCount('count', args, 1);
    return pyInt((self as { items: PyValue[] }).items.filter((item) => pyEquals(item, args[0]!)).length);
  },
  reverse: (self) => {
    (self as { items: PyValue[] }).items.reverse();
    return NONE;
  },
  sort: function* (self, args, kwargs, ctx) {
    checkArgCount('sort', args, 0);
    checkNoKwargs('sort', kwargs, ['key', 'reverse']);
    const list = self as { items: PyValue[] };
    const reverse = isTruthy(kwargs.get('reverse') ?? FALSE);
    list.items = yield* sortValues(list.items, kwargs.get('key') ?? NONE, reverse, ctx);
    return NONE;
  },
  copy: (self) => pyList([...(self as { items: PyValue[] }).items]),
  clear: (self) => {
    (self as { items: PyValue[] }).items.length = 0;
    return NONE;
  },
};

const TUPLE_METHODS: Record<string, MethodImpl> = {
  index: (self, args) => {
    checkArgCount('index', args, 1);
    return pyInt(indexOf((self as { items: PyValue[] }).items, args[0]!, 'tuple'));
  },
  count: (self, args) => {
    checkArgCount('count', args, 1);
    return pyInt((self as { items: PyValue[] }).items.filter((item) => pyEquals(item, args[0]!)).length);
  },
};

type DictSelf = { entries: Map<string, [PyValue, PyValue]> };

const DICT_METHODS: Record<string, MethodImpl> = {
  get: (self, args) => {
    checkArgCount('get', args, 1, 2);
    return (self as DictSelf).entries.get(hashKey(args[0]!))?.[1] ?? args[1] ?? NONE;
  },
  keys: (self) => pyList([...(self as DictSelf).entries.values()].map(([k]) => k)),
  values: (self) => pyList([...(self as DictSelf).entries.values()].map(([, v]) => v)),
  items: (self) => pyList([...(self as DictSelf).entries.values()].map(([k, v]) => pyTuple([k, v]))),
  pop: (self, args) => {
    checkArgCount('pop', args, 1, 2);
    const entries = (self as DictSelf).entries;
    const key = hashKey(args[0]!);
    const entry = entries.get(key);
    if (!entry) {
      if (args[1]) return args[1];
      throw new PyError('KeyError', repr(args[0]!));
    }
    entries.delete(key);
    return entry[1];
  },
  setdefault: (self, args) => {
    checkArgCount('setdefault', args, 1, 2);
    const entries = (self as DictSelf).entries;
    const key = hashKey(args[0]!);
    const existing = entries.get(key);
    if (existing) return existing[1];
    const value = args[1] ?? NONE;
    entries.set(key, [args[0]!, value]);
    return value;
  },
  update: (self, args) => {
    checkArgCount('update', args, 1);
    const other = args[0]!;
    if (other.type !== 'dict') throw new PyError('TypeError', `'${typeName(other)}' object is not a dict`);
    for (const [key, entry] of other.entries) (self as DictSelf).entries.set(key, entry);
    return NONE;
  },
  copy: (self) => ({ type: 'dict', entries: new Map((self as DictSelf).entries) }),
  clear: (self) => {
    (self as DictSelf).entries.clear();
    return NONE;
  },
};

type SetSelf = { entries: Map<string, PyValue> };

const SET_METHODS: Record<string, MethodImpl> = {
  add: (self, args) => {
    checkArgCount('add', args, 1);
    (self as SetSelf).entries.set(hashKey(args[0]!), args[0]!);
    return NONE;
  },
  remove: (self, args) => {
    checkArgCount('remove', args, 1);
    if (!(self as SetSelf).entries.delete(hashKey(args[0]!))) throw new PyError('KeyError', repr(args[0]!));
    return NONE;
  },
  discard: (self, args) => {
    checkArgCount('discard', args, 1);
    (self as SetSelf).entries.delete(hashKey(args[0]!));
    return NONE;
  },
  pop: (self) => {
    const entries = (self as SetSelf).entries;
    const first = entries.entries().next();
    if (first.done) throw new PyError('KeyError', 'pop from an empty set');
    entries.delete(first.value[0]);
    return first.value[1];
  },
  copy: (self) => ({ type: 'set', entries: new Map((self as SetSelf).entries) }),
  clear: (self) => {
    (self as SetSelf).entries.clear();
    return NONE;
  },
};

function selfStr(self: PyValue): string {
  return (self as { value: string }).value;
}

function strArg(args: PyValue[], index: number, method: string): string {
  const value = args[index];
  if (!value || value.type !== 'str') {
    throw new PyError('TypeError', `${method}() argument must be str, not ${value ? typeName(value) : 'nothing'}`);
  }
  return value.value;
}

const STR_METHODS: Record<string, MethodImpl> = {
  upper: (self) => pyStr(selfStr(self).toUpperCase()),
  lower: (self) => pyStr(selfStr(self).toLowerCase()),
  strip: (self) => pyStr(selfStr(self).trim()),
  split: (self, args) => {
    checkArgCount('split', args, 0, 1);
    const sep = args[0] && args[0].type !== 'none' ? strArg(args, 0, 'split') : null;
    const parts = sep === null ? selfStr(self).trim().split(/\s+/).filter((p) => p !== '') : selfStr(self).split(sep);
    return pyList(parts.map(pyStr));
  },
  join: (self, args) => {
    checkArgCount('join', args, 1);
    const parts = toArray(args[0]!).map((item) => {
      if (item.type !== 'str') throw new PyError('TypeError', `sequence item: expected str instance, ${typeName(item)} found`);
      return item.value;
    });
    return pyStr(parts.join(selfStr(self)));
  },
  replace: (self, args) => {
    checkArgCount('replace', args, 2);
    return pyStr(selfStr(self).split(strArg(args, 0, 'replace')).join(strArg(args, 1, 'replace')));
  },
  startswith: (self, args) => {
    checkArgCount('startswith', args, 1);
    return pyBool(selfStr(self).startsWith(strArg(args, 0, 'startswith')));
  },
  endswith: (self, args) => {
    checkArgCount('endswith', args, 1);
    return pyBool(selfStr(self).endsWith(strArg(args, 0, 'endswith')));
  },
  find: (self, args) => {
    checkArgCount('find', args, 1);
    return pyInt(selfStr(self).indexOf(strArg(args, 0, 'find')));
  },
  count: (self, args) => {
    checkArgCount('count', args, 1);
    const needle = strArg(args, 0, 'count');
    return pyInt(needle === '' ? selfStr(self).length + 1 : selfStr(self).split(needle).length - 1);
  },
};

const METHODS: Partial<Record<PyValue['type'], Record<string, MethodImpl>>> = {
  list: LIST_METHODS,
  tuple: TUPLE_METHODS,
  dict: DICT_METHODS,
  set: SET_METHODS,
  str: STR_METHODS,
};

export function getAttribute(obj: PyValue, attr: string): PyValue {
  if (obj.type === 'namespace') {
    const member = obj.members.get(attr);
    if (member) return member;
    throw new PyError('AttributeError', `'${obj.name}' has no attribute '${attr}'`);
  }
  if (obj.type === 'module') {
    const member = obj.scope.vars.get(attr);
    if (member) return member;
    throw new PyError('AttributeError', `module '${obj.name}' has no attribute '${attr}'`);
  }

  const method = METHODS[obj.type]?.[attr];
  if (method) {
    return pyBuiltin(attr, (args, kwargs, ctx) => {
      if (method !== LIST_METHODS.sort) checkNoKwargs(attr, kwargs);
      return method(obj, args, kwargs, ctx);
    });
  }
  throw new PyError('AttributeError', `'${typeName(obj)}' object has no attribute '${attr}'`);
}

