import { BLOCK_TYPES, ENTITY_TYPES, GROUND_TYPES, ITEM_TYPES, type UnlockId, type UnlockLevels } from '../state/types.ts';
import { createCoreBuiltins, DICT_METHODS, LIST_METHODS, SET_METHODS, STR_METHODS } from './builtins.ts';
import { getGameBuiltins } from './program.ts';
import { BUILTIN_UNLOCKS, MEMBER_UNLOCKS } from './unlockCheck.ts';

/**
 * Code completion for the editor, like an IDE's: builtins, keywords, enum members, the player's own
 * names and their other code files. Only what is unlocked is offered, so suggestions never lead to a
 * LockedError. Pure, so it can be tested without the editor.
 */

export type CompletionKind = 'function' | 'keyword' | 'constant' | 'namespace' | 'module' | 'variable' | 'method';

export interface Completion {
  label: string;
  kind: CompletionKind;
  /** Short signature or type shown next to the label. */
  detail?: string;
  documentation?: string;
  /** Monaco snippet syntax ($1, ${1:name}, $0); the label when absent. */
  insertSnippet?: string;
  /** Lower ranks are listed first: the player's names, then the game's API, then Python builtins, then keywords. */
  rank: number;
}

let pythonBuiltins: ReadonlySet<string> | null = null;

/** Plain Python builtins (len, range, …), as opposed to the game's own functions. */
function isPythonBuiltin(name: string): boolean {
  pythonBuiltins ??= new Set(createCoreBuiltins().keys());
  return pythonBuiltins.has(name) && name !== 'print';
}

export interface CompletionRequest {
  unlocks: UnlockLevels;
  /** Text of the current line up to the cursor. */
  linePrefix: string;
  /** Whole source of the file being edited. */
  source: string;
  /** Name of the file being edited (it cannot import itself). */
  fileName: string;
  /** Source of every code file by name. */
  files: Readonly<Record<string, string>>;
}

export interface BuiltinDoc {
  signature: string;
  doc: string;
  /** Parameter names, for parameter hints and the inserted snippet. */
  params: readonly string[];
}

const doc = (signature: string, text: string): BuiltinDoc => {
  const inside = signature.slice(signature.indexOf('(') + 1, signature.lastIndexOf(')'));
  const params = inside.trim() === '' ? [] : inside.split(',').map((param) => param.trim());
  return { signature, doc: text, params };
};

/** Signatures and short descriptions of the builtins, shown in the suggestion list and parameter hints. */
export const BUILTIN_DOCS: Readonly<Record<string, BuiltinDoc>> = {
  harvest: doc('harvest()', 'Harvests the entity below the drone. Unripe plants are destroyed.'),
  do_a_flip: doc('do_a_flip()', 'The drone does a flip.'),
  move: doc('move(direction)', 'Moves the drone one cell North, East, South or West (Up / Down in the mine). Returns whether it moved.'),
  can_harvest: doc('can_harvest()', 'True if the entity below the drone is fully grown.'),
  plant: doc('plant(entity)', 'Plants an entity from Entities below the drone. Returns whether it worked.'),
  till: doc('till()', 'Turns grassland into soil and back.'),
  clear: doc('clear()', 'Resets the farm (or, in the mine, the drone\'s layer).'),
  get_entity_type: doc('get_entity_type()', 'The entity below the drone, or None.'),
  get_ground_type: doc('get_ground_type()', 'The ground below the drone.'),
  get_pos_x: doc('get_pos_x()', 'The drone\'s x coordinate (grows towards East).'),
  get_pos_y: doc('get_pos_y()', 'The drone\'s y coordinate (grows towards North).'),
  get_world_size: doc('get_world_size()', 'The side length of the farm.'),
  num_items: doc('num_items(item)', 'How many of an item from Items you have.'),
  measure: doc('measure()', 'Petals of a sunflower, colour of a mushroom, or the mines around a minefield cell.'),
  get_tick_count: doc('get_tick_count()', 'Ticks the program has run so far.'),
  print: doc('print(*values)', 'Shows values in the output window and above the drone.'),
  quick_print: doc('quick_print(*values)', 'Like print(), only in the output window.'),
  dig: doc('dig(direction)', 'Hits the block next to the drone. Returns True when it breaks.'),
  defuse: doc('defuse(direction)', 'Turns the mine next to the drone into dynamite. False if there is no mine.'),
  swap: doc('swap(direction)', 'Swaps the entity below the drone with its neighbour.'),
  use_item: doc('use_item(item)', 'Uses one of an item: coal for power, clay for clay ground, dynamite to blast.'),
  get_block_type: doc('get_block_type(direction)', 'The block next to the drone, from Blocks.'),
  get_depth: doc('get_depth()', 'The drone\'s layer: 0 on the farm, 1.. in the mine.'),
  get_max_depth: doc('get_max_depth()', 'The number of mine layers.'),
  range: doc('range(stop)', 'Numbers 0 .. stop-1; also range(start, stop) and range(start, stop, step).'),
  len: doc('len(collection)', 'Number of items in a list, tuple, dict, set or string.'),
  abs: doc('abs(x)', 'Absolute value.'),
  min: doc('min(*values)', 'The smallest value.'),
  max: doc('max(*values)', 'The largest value.'),
  sum: doc('sum(values)', 'Sum of the values.'),
  pow: doc('pow(base, exp)', 'base to the power of exp.'),
  round: doc('round(x)', 'Rounds to the nearest integer; round(x, ndigits) to that many digits.'),
  int: doc('int(x)', 'Converts to an integer.'),
  float: doc('float(x)', 'Converts to a float.'),
  str: doc('str(x)', 'Converts to a string.'),
  bool: doc('bool(x)', 'Converts to True or False.'),
  list: doc('list(iterable)', 'Makes a list.'),
  tuple: doc('tuple(iterable)', 'Makes a tuple.'),
  set: doc('set(iterable)', 'Makes a set.'),
  dict: doc('dict()', 'Makes a dict.'),
  sorted: doc('sorted(iterable)', 'A sorted list of the items.'),
  reversed: doc('reversed(sequence)', 'The items in reverse order.'),
  enumerate: doc('enumerate(iterable)', 'Pairs (index, item).'),
  zip: doc('zip(*iterables)', 'Tuples of items taken from each iterable in turn.'),
  any: doc('any(iterable)', 'True if any item is true.'),
  all: doc('all(iterable)', 'True if every item is true.'),
};

/** Keywords and the unlock that allows them; null: available from the start. */
const KEYWORD_UNLOCKS: Readonly<Record<string, UnlockId | null>> = {
  if: null,
  elif: null,
  else: null,
  pass: null,
  True: null,
  False: null,
  None: null,
  while: 'Loops',
  for: 'Loops',
  in: 'Loops',
  break: 'Loops',
  continue: 'Loops',
  and: 'Operators',
  or: 'Operators',
  not: 'Operators',
  is: 'Operators',
  def: 'Functions',
  return: 'Functions',
  global: 'Functions',
  lambda: 'Functions',
  import: 'Functions',
  from: 'Functions',
  as: 'Functions',
};

const KEYWORD_SNIPPETS: Readonly<Record<string, string>> = {
  if: 'if ${1:condition}:\n\t$0',
  elif: 'elif ${1:condition}:\n\t$0',
  else: 'else:\n\t$0',
  while: 'while ${1:True}:\n\t$0',
  for: 'for ${1:i} in ${2:range(${3:get_world_size()})}:\n\t$0',
  def: 'def ${1:name}($2):\n\t$0',
};

const NAMESPACES: Readonly<Record<string, readonly string[]>> = {
  Entities: ENTITY_TYPES,
  Grounds: GROUND_TYPES,
  Items: ITEM_TYPES,
  Blocks: BLOCK_TYPES,
};
const NAMESPACE_UNLOCKS: Readonly<Record<string, UnlockId | null>> = { Entities: null, Grounds: null, Items: null, Blocks: 'Mining' };

const isUnlocked = (unlocks: UnlockLevels, unlock: UnlockId | null | undefined) => !unlock || unlocks[unlock] > 0;

/** Names a file defines at the top level, read with simple patterns so half-typed code still works. */
export interface DefinedName {
  name: string;
  kind: 'function' | 'variable' | 'module';
  params?: string[];
}

/** `withParams` also lists function parameters, which only make sense inside the file itself. */
export function collectNames(source: string, files: Readonly<Record<string, string>> = {}, withParams = true): DefinedName[] {
  const names = new Map<string, DefinedName>();
  const add = (entry: DefinedName) => {
    if (!names.has(entry.name) || entry.kind === 'function') names.set(entry.name, entry);
  };
  for (const line of source.split('\n')) {
    const code = line.replace(/#.*$/, '');
    const def = /^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)?/.exec(code);
    if (def) {
      const params = def[2]!.split(',').map((param) => param.split('=')[0]!.trim()).filter(Boolean);
      add({ name: def[1]!, kind: 'function', params });
      if (withParams) for (const param of params) add({ name: param, kind: 'variable' });
      continue;
    }
    const assign = /^\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?:[+\-*/%]|\/\/|\*\*)?=(?!=)/.exec(code);
    if (assign) for (const name of assign[1]!.split(',')) add({ name: name.trim(), kind: 'variable' });
    const loop = /^\s*for\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+in\b/.exec(code);
    if (loop) for (const name of loop[1]!.split(',')) add({ name: name.trim(), kind: 'variable' });
    const imported = /^\s*import\s+(.+)$/.exec(code);
    if (imported) for (const name of imported[1]!.split(',')) if (/^\w+$/.test(name.trim())) add({ name: name.trim(), kind: 'module' });
    const fromImport = /^\s*from\s+(\w+)\s+import\s+(.+)$/.exec(code);
    if (fromImport) {
      const imports = fromImport[2]!.replace(/[()]/g, '').trim();
      const other = files[fromImport[1]!];
      if (imports === '*') {
        if (other !== undefined) for (const entry of collectNames(other, {}, false)) if (entry.kind !== 'module') add(entry);
      } else {
        const exported = other !== undefined ? collectNames(other, {}, false) : [];
        for (const name of imports.split(',').map((part) => part.trim()).filter(Boolean)) {
          add(exported.find((entry) => entry.name === name) ?? { name, kind: 'variable' });
        }
      }
    }
  }
  return [...names.values()];
}

/** Whether the cursor is inside a comment or a string literal on its line. */
function inCommentOrString(linePrefix: string): boolean {
  let quote: string | null = null;
  for (let i = 0; i < linePrefix.length; i++) {
    const char = linePrefix[i]!;
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '#') {
      return true;
    }
  }
  return quote !== null;
}

function definedCompletion(entry: DefinedName): Completion {
  if (entry.kind === 'function') {
    const params = entry.params ?? [];
    return {
      label: entry.name,
      kind: 'function',
      rank: 0,
      detail: `${entry.name}(${params.join(', ')})`,
      insertSnippet: `${entry.name}(${params.map((param, i) => `\${${i + 1}:${param}}`).join(', ')})$0`,
    };
  }
  return { label: entry.name, kind: entry.kind === 'module' ? 'module' : 'variable', rank: 0 };
}

function builtinCompletion(name: string): Completion {
  const info = BUILTIN_DOCS[name];
  const rank = isPythonBuiltin(name) ? 2 : 1;
  if (!info) return { label: name, kind: 'function', rank };
  const params = info.params.filter((param) => !param.startsWith('*'));
  return {
    label: name,
    kind: 'function',
    rank,
    detail: info.signature,
    documentation: info.doc,
    insertSnippet: params.length === 0 && info.params.length === 0 ? `${name}()$0` : `${name}(${params.map((param, i) => `\${${i + 1}:${param}}`).join(', ')})$0`,
  };
}

const DIRECTION_NAMES = new Set(['North', 'East', 'South', 'West', 'Up', 'Down']);

/** Completions for the cursor position; empty inside comments and strings. */
export function getCompletions(request: CompletionRequest): Completion[] {
  const { unlocks, linePrefix, source, fileName, files } = request;
  if (inCommentOrString(linePrefix)) return [];
  const canImport = isUnlocked(unlocks, 'Functions');
  const otherFiles = Object.keys(files).filter((name) => name !== fileName);

  // `import a, b` / `from a` : the other code files.
  if (/^\s*(import\s+(\w+\s*,\s*)*|from\s+)\w*$/.test(linePrefix)) {
    return canImport ? otherFiles.map((name) => ({ label: name, kind: 'module' as const, detail: 'code file', rank: 0 })) : [];
  }
  // `from a import x`: the names file a defines.
  const fromImport = /^\s*from\s+(\w+)\s+import\s+(\(?\s*(\w+\s*,\s*)*)\w*$/.exec(linePrefix);
  if (fromImport) {
    const other = files[fromImport[1]!];
    if (!canImport || other === undefined) return [];
    return collectNames(other, {}, false).filter((entry) => entry.kind !== 'module').map(definedCompletion);
  }

  // `name.member`
  const member = /([A-Za-z_]\w*)\.(\w*)$/.exec(linePrefix);
  if (member) {
    const owner = member[1]!;
    const enumMembers = NAMESPACES[owner];
    if (enumMembers) {
      if (!isUnlocked(unlocks, NAMESPACE_UNLOCKS[owner])) return [];
      return enumMembers
        .filter((name) => isUnlocked(unlocks, MEMBER_UNLOCKS[`${owner}.${name}`]))
        .map((name) => ({ label: name, kind: 'constant' as const, detail: `${owner}.${name}`, rank: 1 }));
    }
    const names = collectNames(source, files);
    if (names.some((entry) => entry.name === owner && entry.kind === 'module') && files[owner] !== undefined) {
      return collectNames(files[owner]!, {}, false).filter((entry) => entry.kind !== 'module').map(definedCompletion);
    }
    if (!isUnlocked(unlocks, 'Lists')) return [];
    const methods = new Set([...Object.keys(LIST_METHODS), ...Object.keys(DICT_METHODS), ...Object.keys(SET_METHODS), ...Object.keys(STR_METHODS)]);
    return [...methods].sort().map((name) => ({ label: name, kind: 'method' as const, insertSnippet: `${name}($1)$0`, rank: 1 }));
  }

  const completions: Completion[] = [];
  const atLineStart = /^\s*\w*$/.test(linePrefix);
  for (const [keyword, unlock] of Object.entries(KEYWORD_UNLOCKS)) {
    if (!isUnlocked(unlocks, unlock)) continue;
    const snippet = atLineStart ? KEYWORD_SNIPPETS[keyword] : undefined;
    completions.push({ label: keyword, kind: 'keyword', insertSnippet: snippet, rank: 3 });
  }
  for (const name of getGameBuiltins().keys()) {
    if (DIRECTION_NAMES.has(name)) continue;
    if (!isUnlocked(unlocks, BUILTIN_UNLOCKS[name])) continue;
    if (!BUILTIN_DOCS[name] && !(name in BUILTIN_UNLOCKS)) continue;
    completions.push(builtinCompletion(name));
  }
  for (const direction of DIRECTION_NAMES) {
    if (isUnlocked(unlocks, BUILTIN_UNLOCKS[direction])) completions.push({ label: direction, kind: 'constant', detail: 'Direction', rank: 1 });
  }
  for (const namespace of Object.keys(NAMESPACES)) {
    if (isUnlocked(unlocks, NAMESPACE_UNLOCKS[namespace])) completions.push({ label: namespace, kind: 'namespace', rank: 1 });
  }
  const builtinLabels = new Set(completions.map((completion) => completion.label));
  for (const entry of collectNames(source, files)) {
    if (!builtinLabels.has(entry.name)) completions.push(definedCompletion(entry));
  }
  return completions;
}

/** Parameter hint for the innermost unfinished call before the cursor: its signature and the active argument. */
export function getSignatureHelp(
  request: CompletionRequest,
): { label: string; documentation?: string; params: string[]; activeParam: number } | null {
  const { linePrefix, unlocks, source, files } = request;
  if (inCommentOrString(linePrefix)) return null;
  let depth = 0;
  let commas = 0;
  for (let i = linePrefix.length - 1; i >= 0; i--) {
    const char = linePrefix[i]!;
    if (char === ')' || char === ']' || char === '}') depth++;
    else if (char === '[' || char === '{') depth--;
    else if (char === ',' && depth === 0) commas++;
    else if (char === '(') {
      if (depth > 0) {
        depth--;
        continue;
      }
      const name = /([A-Za-z_]\w*)\s*$/.exec(linePrefix.slice(0, i))?.[1];
      if (!name) return null;
      const info = BUILTIN_DOCS[name];
      if (info && isUnlocked(unlocks, BUILTIN_UNLOCKS[name])) {
        return { label: info.signature, documentation: info.doc, params: [...info.params], activeParam: Math.min(commas, Math.max(0, info.params.length - 1)) };
      }
      const defined = collectNames(source, files).find((entry) => entry.name === name && entry.kind === 'function');
      if (defined) {
        const params = defined.params ?? [];
        return { label: `${name}(${params.join(', ')})`, params, activeParam: Math.min(commas, Math.max(0, params.length - 1)) };
      }
      return null;
    }
  }
  return null;
}
