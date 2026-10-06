import { BLOCK_TYPES, type UnlockId, type UnlockLevels } from '../state/types.ts';
import type { Comprehension, Expr, Module, Param, Slice, Stmt } from './ast.ts';
import { PyError } from './errors.ts';

/** Builtin names (functions and constants) and the unlock that makes them available. */
export const BUILTIN_UNLOCKS: Readonly<Record<string, UnlockId>> = {
  range: 'Loops',
  move: 'Expand',
  North: 'Expand',
  East: 'Expand',
  South: 'Expand',
  West: 'Expand',
  can_harvest: 'Senses',
  get_entity_type: 'Senses',
  get_ground_type: 'Senses',
  get_pos_x: 'Senses',
  get_pos_y: 'Senses',
  get_world_size: 'Senses',
  num_items: 'Senses',
  plant: 'Plant',
  till: 'Carrots',
  print: 'Debug',
  quick_print: 'Debug',
  get_tick_count: 'Debug',
  measure: 'Sunflowers',
  dig: 'Mining',
  Up: 'Mining',
  Down: 'Mining',
  get_depth: 'Mining',
  get_max_depth: 'Mining',
  use_item: 'Mining',
  get_block_type: 'Scanner',
  swap: 'Mushrooms',
  defuse: 'Dynamite',
  abs: 'Operators',
  pow: 'Operators',
  round: 'Operators',
  int: 'Operators',
  float: 'Operators',
  str: 'Operators',
  bool: 'Operators',
  len: 'Lists',
  list: 'Lists',
  tuple: 'Lists',
  set: 'Lists',
  dict: 'Lists',
  sorted: 'Lists',
  reversed: 'Lists',
  enumerate: 'Lists',
  zip: 'Lists',
  min: 'Lists',
  max: 'Lists',
  sum: 'Lists',
  any: 'Lists',
  all: 'Lists',
};

/** Enum members (`Entities.Carrot`) and the unlock that introduces them. */
const MEMBER_UNLOCKS: Readonly<Record<string, UnlockId>> = {
  'Entities.Bush': 'Plant',
  'Entities.Carrot': 'Carrots',
  'Entities.Sunflower': 'Sunflowers',
  'Grounds.Soil': 'Carrots',
  'Items.Wood': 'Plant',
  'Items.Carrot': 'Carrots',
  'Items.Power': 'Sunflowers',
  'Entities.Rice': 'Rice',
  'Entities.Mushroom': 'Mushrooms',
  'Grounds.Clay': 'Rice',
  'Grounds.Shaft': 'Mining',
  'Items.Rice': 'Rice',
  'Items.Stone': 'Mining',
  'Items.Clay': 'Mining',
  'Items.Coal': 'Mining',
  'Items.Iron': 'Mining',
  'Items.Quartz': 'Mining',
  'Items.Gold': 'Mining',
  'Items.Mushroom': 'Mining',
  'Items.Dynamite': 'Mining',
  ...Object.fromEntries(BLOCK_TYPES.map((block) => [`Blocks.${block}`, 'Mining'])),
};

const STATEMENT_UNLOCKS: Partial<Record<Stmt['kind'], [label: string, unlock: UnlockId]>> = {
  While: ['while', 'Loops'],
  For: ['for', 'Loops'],
  Break: ['break', 'Loops'],
  Continue: ['continue', 'Loops'],
  Assign: ['variables', 'Variables'],
  AugAssign: ['variables', 'Variables'],
  FunctionDef: ['def', 'Functions'],
  Return: ['return', 'Functions'],
  Global: ['global', 'Functions'],
  Import: ['import', 'Functions'],
  ImportFrom: ['import', 'Functions'],
};

const EXPRESSION_UNLOCKS: Partial<Record<Expr['kind'], [label: string, unlock: UnlockId]>> = {
  BinOp: ['operators', 'Operators'],
  UnaryOp: ['operators', 'Operators'],
  BoolOp: ['operators', 'Operators'],
  Compare: ['operators', 'Operators'],
  IfExp: ['operators', 'Operators'],
  Lambda: ['lambda', 'Functions'],
  List: ['lists', 'Lists'],
  Tuple: ['tuples', 'Lists'],
  Set: ['sets', 'Lists'],
  Dict: ['dicts', 'Lists'],
  Subscript: ['indexing', 'Lists'],
  ListComp: ['list comprehensions', 'Lists'],
};

function lockedError(label: string, unlock: UnlockId, line: number): PyError {
  return new PyError('LockedError', `${label} is not unlocked yet (unlock "${unlock}" first)`, line);
}

/**
 * Rejects programs that use language features or builtins the player has not unlocked yet, reporting
 * the first offending line. Runs before execution, like a syntax check.
 */
export function checkUnlocks(module: Module, unlocks: UnlockLevels): void {
  const definedNames = collectDefinedNames(module.body);
  const require = (label: string, unlock: UnlockId, line: number) => {
    if (unlocks[unlock] <= 0) throw lockedError(label, unlock, line);
  };

  const visitParams = (params: Param[]) => params.forEach((param) => param.defaultValue && visitExpr(param.defaultValue));
  const visitComprehension = (gen: Comprehension) => {
    visitExpr(gen.target);
    visitExpr(gen.iter);
    gen.ifs.forEach(visitExpr);
  };
  const visitIndex = (index: Expr | Slice) => {
    if (index.kind !== 'Slice') return visitExpr(index);
    for (const part of [index.lower, index.upper, index.step]) if (part) visitExpr(part);
  };

  function visitExpr(expr: Expr): void {
    const feature = EXPRESSION_UNLOCKS[expr.kind];
    if (feature) require(feature[0], feature[1], expr.line);
    switch (expr.kind) {
      case 'Name': {
        const unlock = BUILTIN_UNLOCKS[expr.id];
        if (unlock && !definedNames.has(expr.id)) require(`${expr.id}`, unlock, expr.line);
        return;
      }
      case 'Num':
      case 'Str':
      case 'Bool':
      case 'NoneLit':
        return;
      case 'BinOp':
        visitExpr(expr.left);
        visitExpr(expr.right);
        return;
      case 'UnaryOp':
        visitExpr(expr.operand);
        return;
      case 'BoolOp':
        expr.values.forEach(visitExpr);
        return;
      case 'Compare':
        visitExpr(expr.left);
        expr.comparators.forEach(visitExpr);
        return;
      case 'Call':
        visitExpr(expr.func);
        expr.args.forEach(visitExpr);
        expr.keywords.forEach((keyword) => visitExpr(keyword.value));
        return;
      case 'Attribute': {
        if (expr.value.kind === 'Name') {
          const member = `${expr.value.id}.${expr.attr}`;
          const unlock = MEMBER_UNLOCKS[member];
          if (unlock) require(member, unlock, expr.line);
        }
        visitExpr(expr.value);
        return;
      }
      case 'Subscript':
        visitExpr(expr.value);
        visitIndex(expr.index);
        return;
      case 'List':
      case 'Tuple':
      case 'Set':
        expr.elts.forEach(visitExpr);
        return;
      case 'Dict':
        expr.keys.forEach(visitExpr);
        expr.values.forEach(visitExpr);
        return;
      case 'IfExp':
        visitExpr(expr.test);
        visitExpr(expr.body);
        visitExpr(expr.orelse);
        return;
      case 'Lambda':
        visitParams(expr.params);
        visitExpr(expr.body);
        return;
      case 'ListComp':
        visitExpr(expr.elt);
        expr.generators.forEach(visitComprehension);
        return;
    }
  }

  function visitStmt(stmt: Stmt): void {
    const feature = STATEMENT_UNLOCKS[stmt.kind];
    if (feature) require(feature[0], feature[1], stmt.line);
    switch (stmt.kind) {
      case 'ExprStmt':
        visitExpr(stmt.value);
        return;
      case 'Assign':
        stmt.targets.forEach(visitTarget);
        visitExpr(stmt.value);
        return;
      case 'AugAssign':
        visitTarget(stmt.target);
        visitExpr(stmt.value);
        return;
      case 'If':
      case 'While':
        visitExpr(stmt.test);
        stmt.body.forEach(visitStmt);
        stmt.orelse.forEach(visitStmt);
        return;
      case 'For':
        visitTarget(stmt.target);
        visitExpr(stmt.iter);
        stmt.body.forEach(visitStmt);
        stmt.orelse.forEach(visitStmt);
        return;
      case 'FunctionDef':
        visitParams(stmt.params);
        stmt.body.forEach(visitStmt);
        return;
      case 'Return':
        if (stmt.value) visitExpr(stmt.value);
        return;
      case 'Break':
      case 'Continue':
      case 'Pass':
      case 'Global':
      case 'Import':
      case 'ImportFrom':
        return;
    }
  }

  /** Plain name targets are not uses of a builtin; anything else (subscripts, unpacking) is checked. */
  function visitTarget(target: Expr): void {
    if (target.kind !== 'Name') visitExpr(target);
  }

  module.body.forEach(visitStmt);
}

/** Names the program defines itself; those shadow builtins and are never treated as locked. */
function collectDefinedNames(body: Stmt[]): Set<string> {
  const names = new Set<string>();
  const addTarget = (target: Expr) => {
    if (target.kind === 'Name') names.add(target.id);
    else if (target.kind === 'Tuple' || target.kind === 'List') target.elts.forEach(addTarget);
  };
  const addParams = (params: Param[]) => params.forEach((param) => names.add(param.name));
  const visitExpr = (expr: Expr): void => {
    if (expr.kind === 'Lambda') addParams(expr.params);
    if (expr.kind === 'ListComp') expr.generators.forEach((gen) => addTarget(gen.target));
  };
  const visit = (stmts: Stmt[]) => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'Assign':
          stmt.targets.forEach(addTarget);
          visitExpr(stmt.value);
          break;
        case 'AugAssign':
          addTarget(stmt.target);
          break;
        case 'For':
          addTarget(stmt.target);
          visit(stmt.body);
          visit(stmt.orelse);
          break;
        case 'If':
        case 'While':
          visit(stmt.body);
          visit(stmt.orelse);
          break;
        case 'FunctionDef':
          names.add(stmt.name);
          addParams(stmt.params);
          visit(stmt.body);
          break;
        case 'ExprStmt':
          visitExpr(stmt.value);
          break;
        case 'Import':
          stmt.modules.forEach((module) => names.add(module));
          break;
        case 'ImportFrom':
          stmt.names?.forEach((name) => names.add(name));
          break;
        default:

          break;
      }
    }
  };
  visit(body);
  return names;
}
