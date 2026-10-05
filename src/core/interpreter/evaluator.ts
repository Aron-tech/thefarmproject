import type { Comprehension, Expr, Module, Param, Slice, Stmt } from './ast.ts';
import { getAttribute } from './builtins.ts';
import { PyError } from './errors.ts';
import { binaryOp, contains, getItem, getSlice, setItem, unaryOp } from './operations.ts';
import {
  compareValues,
  FALSE,
  isTruthy,
  iterate,
  NONE,
  OP_SIGNAL,
  pyDict,
  pyEquals,
  pyFloat,
  pyInt,
  pyIs,
  pyList,
  pySet,
  pyStr,
  pyTuple,
  repr,
  Scope,
  toArray,
  TRUE,
  typeName,
  type CallContext,
  type Gen,
  type PyFunction,
  type PyValue,
} from './values.ts';

export const DEFAULT_MAX_RECURSION_DEPTH = 200;
const MAX_VARIABLE_REPR_LENGTH = 200;

/** Completion of a statement: normal, break, continue, or a return carrying its value. */
type Completion = 'normal' | 'break' | 'continue' | { returnValue: PyValue };

export interface InterpreterOptions {
  builtins: ReadonlyMap<string, PyValue>;
  getTickCount?: () => number;
  maxRecursionDepth?: number;
}

export interface VariableSnapshot {
  globals: Record<string, string>;
  locals: Record<string, string> | null;
}

/**
 * Generator-based tree-walking interpreter. Every statement yields its line number and every
 * expression-level operation yields OP_SIGNAL, so a scheduler can meter, pause or stop execution at
 * any point without blocking the thread.
 */
export class Interpreter {
  readonly globals = new Scope(null, null, new Set());
  /** Line of the innermost statement currently executing (kept on error for reporting). */
  currentLine = 0;

  private readonly module: Module;
  private readonly builtins: ReadonlyMap<string, PyValue>;
  private readonly maxRecursionDepth: number;
  private readonly ctx: CallContext;
  private currentScope: Scope = this.globals;
  private depth = 0;

  constructor(module: Module, options: InterpreterOptions) {
    this.module = module;
    this.builtins = options.builtins;
    this.maxRecursionDepth = options.maxRecursionDepth ?? DEFAULT_MAX_RECURSION_DEPTH;
    const getTickCount = options.getTickCount ?? (() => 0);
    this.ctx = {
      callValue: (fn, args, kwargs) => this.callValue(fn, args, kwargs),
      getTickCount,
    };
  }

  *run(): Gen<void> {
    try {
      yield* this.execBlock(this.module.body, this.globals);
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  getVariables(): VariableSnapshot {
    const snapshot = (scope: Scope) => {
      const result: Record<string, string> = {};
      for (const [name, value] of scope.vars) {
        if (value.type === 'function') continue;
        const text = repr(value);
        result[name] = text.length > MAX_VARIABLE_REPR_LENGTH ? `${text.slice(0, MAX_VARIABLE_REPR_LENGTH)}…` : text;
      }
      return result;
    };
    return {
      globals: snapshot(this.globals),
      locals: this.currentScope === this.globals ? null : snapshot(this.currentScope),
    };
  }

  private normalizeError(error: unknown): PyError {
    if (error instanceof PyError) {
      if (error.line === null) error.line = this.currentLine;
      return error;
    }
    if (error instanceof RangeError && /call stack/i.test(error.message)) {
      return new PyError('RecursionError', 'maximum recursion depth exceeded', this.currentLine);
    }
    const message = error instanceof Error ? error.message : String(error);
    return new PyError('RuntimeError', `internal interpreter error: ${message}`, this.currentLine);
  }

  // ---------------------------------------------------------------- names

  private lookup(name: string, scope: Scope): PyValue {
    let current: Scope | null = scope;
    while (current && current.localNames !== null) {
      if (current.globalNames.has(name)) break;
      if (current.localNames.has(name)) {
        const value = current.vars.get(name);
        if (value) return value;
        throw new PyError('UnboundLocalError', `local variable '${name}' referenced before assignment`);
      }
      current = current.parent;
    }
    const value = this.globals.vars.get(name) ?? this.builtins.get(name);
    if (!value) throw new PyError('NameError', `name '${name}' is not defined`);
    return value;
  }

  private assignName(name: string, value: PyValue, scope: Scope): void {
    if (scope.localNames !== null && scope.globalNames.has(name)) {
      this.globals.vars.set(name, value);
    } else {
      scope.vars.set(name, value);
    }
  }

  private *assign(target: Expr, value: PyValue, scope: Scope): Gen<void> {
    switch (target.kind) {
      case 'Name':
        this.assignName(target.id, value, scope);
        return;
      case 'Subscript': {
        const container = yield* this.evalExpr(target.value, scope);
        if (target.index.kind === 'Slice') throw new PyError('TypeError', 'slice assignment is not supported');
        const index = yield* this.evalExpr(target.index, scope);
        yield OP_SIGNAL;
        setItem(container, index, value);
        return;
      }
      case 'Tuple':
      case 'List': {
        const items = toArray(value);
        if (items.length !== target.elts.length) {
          const relation = items.length > target.elts.length ? 'too many' : 'not enough';
          throw new PyError('ValueError', `${relation} values to unpack (expected ${target.elts.length}, got ${items.length})`);
        }
        for (let i = 0; i < items.length; i++) yield* this.assign(target.elts[i]!, items[i]!, scope);
        return;
      }
      default:
        throw new PyError('SyntaxError', 'cannot assign to expression');
    }
  }

  // ---------------------------------------------------------------- statements

  private *execBlock(stmts: Stmt[], scope: Scope): Gen<Completion> {
    for (const stmt of stmts) {
      const completion = yield* this.execStmt(stmt, scope);
      if (completion !== 'normal') return completion;
    }
    return 'normal';
  }

  private *execStmt(stmt: Stmt, scope: Scope): Gen<Completion> {
    this.currentLine = stmt.line;
    yield stmt.line;

    switch (stmt.kind) {
      case 'ExprStmt':
        yield* this.evalExpr(stmt.value, scope);
        return 'normal';
      case 'Assign': {
        const value = yield* this.evalExpr(stmt.value, scope);
        for (const target of stmt.targets) yield* this.assign(target, value, scope);
        return 'normal';
      }
      case 'AugAssign':
        yield* this.execAugAssign(stmt, scope);
        return 'normal';
      case 'If': {
        const test = yield* this.evalExpr(stmt.test, scope);
        return yield* this.execBlock(isTruthy(test) ? stmt.body : stmt.orelse, scope);
      }
      case 'While': {
        let first = true;
        for (;;) {
          if (!first) {
            this.currentLine = stmt.line;
            yield stmt.line;
          }
          first = false;
          if (!isTruthy(yield* this.evalExpr(stmt.test, scope))) break;
          const completion = yield* this.execBlock(stmt.body, scope);
          if (completion === 'break') return 'normal';
          if (typeof completion === 'object') return completion;
        }
        return yield* this.execBlock(stmt.orelse, scope);
      }
      case 'For': {
        const iterable = yield* this.evalExpr(stmt.iter, scope);
        let first = true;
        for (const item of iterate(iterable)) {
          if (!first) {
            this.currentLine = stmt.line;
            yield stmt.line;
          }
          first = false;
          yield* this.assign(stmt.target, item, scope);
          const completion = yield* this.execBlock(stmt.body, scope);
          if (completion === 'break') return 'normal';
          if (typeof completion === 'object') return completion;
        }
        return yield* this.execBlock(stmt.orelse, scope);
      }
      case 'FunctionDef': {
        const fn = yield* this.makeFunction(stmt.name, stmt.params, stmt.body, stmt.localNames, stmt.globalNames, scope);
        this.assignName(stmt.name, fn, scope);
        return 'normal';
      }
      case 'Return':
        return { returnValue: stmt.value ? yield* this.evalExpr(stmt.value, scope) : NONE };
      case 'Break':
        return 'break';
      case 'Continue':
        return 'continue';
      case 'Pass':
      case 'Global':
        return 'normal';
    }
  }

  private *execAugAssign(stmt: Extract<Stmt, { kind: 'AugAssign' }>, scope: Scope): Gen<void> {
    const target = stmt.target;
    if (target.kind === 'Name') {
      const current = this.lookup(target.id, scope);
      const operand = yield* this.evalExpr(stmt.value, scope);
      yield OP_SIGNAL;
      this.assignName(target.id, this.inPlaceOp(stmt.op, current, operand), scope);
      return;
    }
    if (target.kind === 'Subscript' && target.index.kind !== 'Slice') {
      const container = yield* this.evalExpr(target.value, scope);
      const index = yield* this.evalExpr(target.index, scope);
      const operand = yield* this.evalExpr(stmt.value, scope);
      yield OP_SIGNAL;
      setItem(container, index, this.inPlaceOp(stmt.op, getItem(container, index), operand));
      return;
    }
    throw new PyError('SyntaxError', 'illegal expression for augmented assignment');
  }

  /** `list += iterable` mutates the list in place, like Python; everything else is a plain binary op. */
  private inPlaceOp(op: Extract<Stmt, { kind: 'AugAssign' }>['op'], current: PyValue, operand: PyValue): PyValue {
    if (op === '+' && current.type === 'list') {
      current.items.push(...toArray(operand));
      return current;
    }
    return binaryOp(op, current, operand);
  }

  private *makeFunction(
    name: string,
    params: Param[],
    body: Stmt[] | Expr,
    localNames: readonly string[],
    globalNames: readonly string[],
    scope: Scope,
  ): Gen<PyFunction> {
    const defaults: (PyValue | null)[] = [];
    for (const param of params) {
      defaults.push(param.defaultValue ? yield* this.evalExpr(param.defaultValue, scope) : null);
    }
    return {
      type: 'function',
      name,
      params,
      defaults,
      body,
      localNames: new Set(localNames),
      globalNames: new Set(globalNames),
      closure: scope,
    };
  }

  // ---------------------------------------------------------------- calls

  private *callValue(fn: PyValue, args: PyValue[], kwargs: Map<string, PyValue>): Gen<PyValue> {
    if (fn.type === 'builtin') {
      const result = fn.call(args, kwargs, this.ctx);
      return isGenerator(result) ? yield* result : result;
    }
    if (fn.type !== 'function') throw new PyError('TypeError', `'${typeName(fn)}' object is not callable`);

    if (this.depth >= this.maxRecursionDepth) {
      throw new PyError('RecursionError', 'maximum recursion depth exceeded');
    }
    const scope = new Scope(fn.closure, fn.localNames, fn.globalNames);
    bindArguments(fn, args, kwargs, scope);

    const savedScope = this.currentScope;
    const savedLine = this.currentLine;
    this.depth++;
    this.currentScope = scope;
    try {
      let result: PyValue = NONE;
      if (Array.isArray(fn.body)) {
        const completion = yield* this.execBlock(fn.body, scope);
        if (typeof completion === 'object') result = completion.returnValue;
      } else {
        result = yield* this.evalExpr(fn.body, scope);
      }
      this.currentLine = savedLine;
      return result;
    } finally {
      this.depth--;
      this.currentScope = savedScope;
    }
  }

  // ---------------------------------------------------------------- expressions

  private *evalExpr(expr: Expr, scope: Scope): Gen<PyValue> {
    switch (expr.kind) {
      case 'Name':
        return this.lookup(expr.id, scope);
      case 'Num':
        return expr.isFloat ? pyFloat(expr.value) : pyInt(expr.value);
      case 'Str':
        return pyStr(expr.value);
      case 'Bool':
        return expr.value ? TRUE : FALSE;
      case 'NoneLit':
        return NONE;
      case 'BinOp': {
        const left = yield* this.evalExpr(expr.left, scope);
        const right = yield* this.evalExpr(expr.right, scope);
        yield OP_SIGNAL;
        return binaryOp(expr.op, left, right);
      }
      case 'UnaryOp': {
        const operand = yield* this.evalExpr(expr.operand, scope);
        yield OP_SIGNAL;
        return unaryOp(expr.op, operand);
      }
      case 'BoolOp': {
        let value: PyValue = NONE;
        for (const operand of expr.values) {
          value = yield* this.evalExpr(operand, scope);
          if (expr.op === 'and' ? !isTruthy(value) : isTruthy(value)) return value;
        }
        return value;
      }
      case 'Compare': {
        let left = yield* this.evalExpr(expr.left, scope);
        for (let i = 0; i < expr.ops.length; i++) {
          const right = yield* this.evalExpr(expr.comparators[i]!, scope);
          yield OP_SIGNAL;
          if (!compare(expr.ops[i]!, left, right)) return FALSE;
          left = right;
        }
        return TRUE;
      }
      case 'Call': {
        const fn = yield* this.evalExpr(expr.func, scope);
        const args: PyValue[] = [];
        for (const arg of expr.args) args.push(yield* this.evalExpr(arg, scope));
        const kwargs = new Map<string, PyValue>();
        for (const keyword of expr.keywords) kwargs.set(keyword.name, yield* this.evalExpr(keyword.value, scope));
        yield OP_SIGNAL;
        return yield* this.callValue(fn, args, kwargs);
      }
      case 'Attribute': {
        const value = yield* this.evalExpr(expr.value, scope);
        return getAttribute(value, expr.attr);
      }
      case 'Subscript': {
        const container = yield* this.evalExpr(expr.value, scope);
        if (expr.index.kind === 'Slice') return yield* this.evalSlice(container, expr.index, scope);
        const index = yield* this.evalExpr(expr.index, scope);
        yield OP_SIGNAL;
        return getItem(container, index);
      }
      case 'List':
        return pyList(yield* this.evalAll(expr.elts, scope));
      case 'Tuple':
        return pyTuple(yield* this.evalAll(expr.elts, scope));
      case 'Set':
        return pySet(yield* this.evalAll(expr.elts, scope));
      case 'Dict': {
        const pairs: [PyValue, PyValue][] = [];
        for (let i = 0; i < expr.keys.length; i++) {
          const key = yield* this.evalExpr(expr.keys[i]!, scope);
          pairs.push([key, yield* this.evalExpr(expr.values[i]!, scope)]);
        }
        return pyDict(pairs);
      }
      case 'IfExp': {
        const test = yield* this.evalExpr(expr.test, scope);
        return yield* this.evalExpr(isTruthy(test) ? expr.body : expr.orelse, scope);
      }
      case 'Lambda':
        return yield* this.makeFunction('<lambda>', expr.params, expr.body, expr.params.map((p) => p.name), [], scope);
      case 'ListComp': {
        const targetNames = new Set<string>();
        for (const generator of expr.generators) collectTargetNames(generator.target, targetNames);
        const compScope = new Scope(scope, targetNames, new Set());
        const results: PyValue[] = [];
        yield* this.runComprehension(expr.generators, 0, expr.elt, scope, compScope, results);
        return pyList(results);
      }
    }
  }

  private *evalAll(exprs: Expr[], scope: Scope): Gen<PyValue[]> {
    const values: PyValue[] = [];
    for (const expr of exprs) values.push(yield* this.evalExpr(expr, scope));
    return values;
  }

  private *evalSlice(container: PyValue, slice: Slice, scope: Scope): Gen<PyValue> {
    const lower = slice.lower ? yield* this.evalExpr(slice.lower, scope) : NONE;
    const upper = slice.upper ? yield* this.evalExpr(slice.upper, scope) : NONE;
    const step = slice.step ? yield* this.evalExpr(slice.step, scope) : NONE;
    yield OP_SIGNAL;
    return getSlice(container, lower, upper, step);
  }

  private *runComprehension(
    generators: Comprehension[],
    index: number,
    elt: Expr,
    outerScope: Scope,
    compScope: Scope,
    results: PyValue[],
  ): Gen<void> {
    const generator = generators[index];
    if (!generator) {
      results.push(yield* this.evalExpr(elt, compScope));
      return;
    }
    // The outermost iterable is evaluated in the enclosing scope, as in Python.
    const iterable = yield* this.evalExpr(generator.iter, index === 0 ? outerScope : compScope);
    for (const item of iterate(iterable)) {
      yield OP_SIGNAL;
      yield* this.assign(generator.target, item, compScope);
      let accepted = true;
      for (const condition of generator.ifs) {
        if (!isTruthy(yield* this.evalExpr(condition, compScope))) {
          accepted = false;
          break;
        }
      }
      if (accepted) yield* this.runComprehension(generators, index + 1, elt, outerScope, compScope, results);
    }
  }
}

function isGenerator(value: PyValue | Gen<PyValue>): value is Gen<PyValue> {
  return typeof (value as Gen<PyValue>).next === 'function';
}

function collectTargetNames(target: Expr, names: Set<string>): void {
  if (target.kind === 'Name') names.add(target.id);
  else if (target.kind === 'Tuple' || target.kind === 'List') target.elts.forEach((elt) => collectTargetNames(elt, names));
}

function compare(op: Extract<Expr, { kind: 'Compare' }>['ops'][number], left: PyValue, right: PyValue): boolean {
  switch (op) {
    case '==':
      return pyEquals(left, right);
    case '!=':
      return !pyEquals(left, right);
    case '<':
      return compareValues(left, right, op) < 0;
    case '>':
      return compareValues(left, right, op) > 0;
    case '<=':
      return compareValues(left, right, op) <= 0;
    case '>=':
      return compareValues(left, right, op) >= 0;
    case 'in':
      return contains(right, left);
    case 'not in':
      return !contains(right, left);
    case 'is':
      return pyIs(left, right);
    case 'is not':
      return !pyIs(left, right);
  }
}

function bindArguments(fn: PyFunction, args: PyValue[], kwargs: Map<string, PyValue>, scope: Scope): void {
  const { params } = fn;
  if (args.length > params.length) {
    throw new PyError('TypeError', `${fn.name}() takes ${params.length} positional argument(s) but ${args.length} were given`);
  }
  for (const key of kwargs.keys()) {
    if (!params.some((p) => p.name === key)) {
      throw new PyError('TypeError', `${fn.name}() got an unexpected keyword argument '${key}'`);
    }
  }
  params.forEach((param, i) => {
    const positional = args[i];
    const keyword = kwargs.get(param.name);
    if (positional && keyword) {
      throw new PyError('TypeError', `${fn.name}() got multiple values for argument '${param.name}'`);
    }
    const value = positional ?? keyword ?? fn.defaults[i];
    if (!value) throw new PyError('TypeError', `${fn.name}() missing required argument: '${param.name}'`);
    scope.vars.set(param.name, value);
  });
}

