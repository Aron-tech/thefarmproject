import { describe, expect, it } from 'vitest';
import { applyAction } from '../state/actions.ts';
import { createGameState } from '../state/gameState.ts';
import type { DroneAction, GameState, UnlockLevels } from '../state/types.ts';
import { createFullUnlocks, createLockedUnlocks } from '../state/unlocks.ts';
import { tokenize } from './lexer.ts';
import { runSync } from './runSync.ts';

/** Runs code and returns its printed lines, failing the test on a Python error. */
function output(code: string): string[] {
  const result = runSync(code);
  if (result.error) throw new Error(result.error.format());
  return result.output;
}

function errorOf(code: string) {
  const result = runSync(code);
  if (!result.error) throw new Error('expected an error');
  return result.error;
}

describe('lexer', () => {
  it('emits INDENT / DEDENT around blocks and ignores blank and comment lines', () => {
    const types = tokenize('if x:\n    a\n\n    # note\n    b\nc\n').map((t) => t.type);
    expect(types).toEqual([
      'keyword', 'name', 'op', 'newline',
      'indent', 'name', 'newline', 'name', 'newline',
      'dedent', 'name', 'newline', 'eof',
    ]);
  });

  it('joins lines inside brackets', () => {
    const types = tokenize('x = [1,\n  2]\n').map((t) => t.type);
    expect(types.filter((t) => t === 'newline')).toHaveLength(1);
  });
});

describe('literals and arithmetic', () => {
  it('follows Python numeric semantics', () => {
    expect(output('print(7 / 2, 7 // 2, -7 // 2, -7 % 3, 2 ** 10, 2 ** -1)')).toEqual(['3.5 3 -4 2 1024 0.5']);
    expect(output('print(1.0, 3 * 1.5, 10 / 5, True + 1)')).toEqual(['1.0 4.5 2.0 2']);
    expect(output('print(-2 ** 2, (1 + 2) * 3, 0x10, 1_000)')).toEqual(['-4 9 16 1000']);
  });

  it('handles strings, lists, tuples, dicts and sets', () => {
    expect(output("print('ab' + 'c', 'x' * 3, [1, 2] + [3], (1,) * 2)")).toEqual(["abc xxx [1, 2, 3] (1, 1)"]);
    expect(output("d = {'a': 1}\nd['b'] = 2\nprint(d, len(d), 'a' in d)")).toEqual(["{'a': 1, 'b': 2} 2 True"]);
    expect(output('s = {1, 2}\ns.add(2)\ns.add(3)\nprint(len(s), 3 in s, set())')).toEqual(['3 True set()']);
    expect(output('l = [5, 1, 4]\nl.sort()\nprint(l, l[-1], l[0:2], l[::-1])')).toEqual(['[1, 4, 5] 5 [1, 4] [5, 4, 1]']);
  });

  it('supports comparisons, chaining and boolean operators', () => {
    expect(output('print(1 < 2 < 3, 1 < 3 < 2, 1 == 1.0, None is None, 2 not in [1])')).toEqual(['True False True True True']);
    expect(output("print(0 or 'x', 1 and 2, not 0, [] or None)")).toEqual(['x 2 True None']);
    expect(output("print('yes' if 1 > 0 else 'no')")).toEqual(['yes']);
  });

  it('rounds like Python', () => {
    expect(output('print(round(2.5), round(3.5), round(-2.5), round(1.256, 2))')).toEqual(['2 4 -2 1.26']);
  });
});

describe('control flow', () => {
  it('runs loops with break, continue and else', () => {
    const code = [
      'total = 0',
      'for i in range(10):',
      '    if i % 2 == 0:',
      '        continue',
      '    if i > 7:',
      '        break',
      '    total += i',
      'else:',
      '    print("not reached")',
      'print(total)',
      'n = 0',
      'while n < 3:',
      '    n += 1',
      'else:',
      '    print("done", n)',
    ].join('\n');
    expect(output(code)).toEqual(['16', 'done 3']);
  });

  it('unpacks tuples in assignments and loops', () => {
    expect(output('a, b = 1, 2\na, b = b, a\nprint(a, b)')).toEqual(['2 1']);
    expect(output('for i, v in enumerate(["x", "y"]):\n    print(i, v)')).toEqual(['0 x', '1 y']);
  });

  it('supports one-line suites and semicolons', () => {
    expect(output('if True: print(1); print(2)')).toEqual(['1', '2']);
  });
});

describe('functions and scopes', () => {
  it('supports defaults, keyword arguments, recursion and closures', () => {
    const code = [
      'def fib(n):',
      '    if n < 2:',
      '        return n',
      '    return fib(n - 1) + fib(n - 2)',
      'def greet(name, greeting="hi"):',
      '    return greeting + " " + name',
      'def counter():',
      '    count = [0]',
      '    def inc():',
      '        count[0] += 1',
      '        return count[0]',
      '    return inc',
      'c = counter()',
      'c()',
      'print(fib(15), greet("bob"), greet(greeting="yo", name="al"), c())',
    ].join('\n');
    expect(output(code)).toEqual(['610 hi bob yo al 2']);
  });

  it('implements local / global scoping rules', () => {
    expect(output('x = 1\ndef f():\n    global x\n    x = 2\nf()\nprint(x)')).toEqual(['2']);
    expect(output('x = 1\ndef f():\n    x = 2\nf()\nprint(x)')).toEqual(['1']);
    expect(errorOf('x = 1\ndef f():\n    print(x)\n    x = 2\nf()').pyType).toBe('UnboundLocalError');
  });

  it('supports lambdas, comprehensions and sorted with key', () => {
    expect(output('print([x * x for x in range(5) if x % 2 == 0])')).toEqual(['[0, 4, 16]']);
    expect(output('print(sorted([3, 1, 2], key=lambda v: -v), max([1, 5, 2]), sum(x for x in range(4)))')).toEqual([
      '[3, 2, 1] 5 6',
    ]);
    expect(output('pairs = [(1, "b"), (0, "a")]\npairs.sort()\nprint(pairs)')).toEqual(["[(0, 'a'), (1, 'b')]"]);
  });
});

describe('errors', () => {
  it('reports syntax errors with line numbers', () => {
    const error = errorOf('x = 1\nif x\n    pass');
    expect(error.pyType).toBe('SyntaxError');
    expect(error.line).toBe(2);
    expect(errorOf('if True:\nprint(1)').pyType).toBe('IndentationError');
    expect(errorOf('import os').message).toContain("no code file named 'os'");
    expect(errorOf('class A:').message).toContain("'class' is not supported");
  });

  it('reports runtime errors at the innermost line', () => {
    const error = errorOf('def f():\n    return 1 / 0\nf()');
    expect(error.pyType).toBe('ZeroDivisionError');
    expect(error.line).toBe(2);
    expect(errorOf('print(undefined_name)').pyType).toBe('NameError');
    expect(errorOf('[1][5]').pyType).toBe('IndexError');
    expect(errorOf('{}["k"]').pyType).toBe('KeyError');
    expect(errorOf('1 + "a"').pyType).toBe('TypeError');
    expect(errorOf('{[1]: 2}').pyType).toBe('TypeError');
  });

  it('raises RecursionError instead of overflowing the stack', () => {
    expect(errorOf('def f(n):\n    return f(n + 1)\nf(0)').pyType).toBe('RecursionError');
  });
});

describe('scheduling', () => {
  it('can interrupt an infinite loop by tick budget', () => {
    const result = runSync('while True:\n    pass', { maxTicks: 5000 });
    expect(result.finished).toBe(false);
    expect(result.error).toBeNull();
    expect(result.ticks).toBe(5000);
  });

  it('charges drone actions their tick cost', () => {
    const { ticks } = runSync('move(North)');
    // 1 statement + 1 call op + 200 for the move itself.
    expect(ticks).toBe(202);
  });
});

describe('game API', () => {
  function runOnFarm(code: string, maxTicks?: number): { state: GameState; output: string[]; actions: DroneAction[] } {
    let state = createGameState(3);
    const actions: DroneAction[] = [];
    const result = runSync(code, {
      maxTicks,
      onAction: (action, ticks) => {
        actions.push(action);
        const outcome = applyAction(state, action, ticks);
        state = outcome.state;
        return outcome.result;
      },
    });
    if (result.error) throw new Error(result.error.format());
    return { state, output: result.output, actions };
  }

  it('exposes enums and sensors', () => {
    const { output: lines } = runOnFarm(
      'print(get_entity_type(), get_ground_type(), get_pos_x(), get_world_size(), North, Items.Hay)\n' +
        'print(get_entity_type() == Entities.Grass, num_items(Items.Hay))',
    );
    expect(lines).toEqual(['Entities.Grass Grounds.Grassland 0 3 North Items.Hay', 'True 0']);
  });

  it('runs the MVP farming loop and collects hay', () => {
    const code = [
      'while True:',
      '    for i in range(get_world_size()):',
      '        if can_harvest():',
      '            harvest()',
      '        move(North)',
      '    move(East)',
    ].join('\n');
    const { state } = runOnFarm(code, 50_000);
    expect(state.inventory.Hay).toBeGreaterThan(10);
  });

  it('validates argument types', () => {
    expect(() => runOnFarm('move("North")')).toThrow(/expects a value from Direction/);
    expect(() => runOnFarm('plant(Items.Hay)')).toThrow(/expects a value from Entities/);
  });

  it('measures sunflower petals', () => {
    const { output: lines } = runOnFarm('print(measure())');
    expect(lines).toEqual(['None']);
  });
});

describe('import', () => {
  const files = {
    tools: 'LABEL = "tools"\ncount = 0\ndef bump():\n    global count\n    count += 1\n    return count\nprint("tools loaded")',
    broken: 'x = 1\ny = 1 / 0',
    syntax: 'if x\n    pass',
    nested: 'import tools\ndef twice():\n    return tools.bump() + tools.bump()',
  };
  const run = (code: string, unlocks?: UnlockLevels) => runSync(code, { files, unlocks });

  it('imports a file as a module and uses its functions and variables', () => {
    const result = run('import tools\nprint(tools.LABEL, tools.bump(), tools.bump(), tools.count)');
    expect(result.error).toBeNull();
    expect(result.output).toEqual(['tools loaded', 'tools 1 2 2']);
  });

  it('imports names directly, or everything with *', () => {
    expect(run('from tools import bump, LABEL\nprint(bump(), LABEL)').output).toEqual(['tools loaded', '1 tools']);
    expect(run('from tools import *\nprint(bump())').output).toEqual(['tools loaded', '1']);
    expect(run('def f():\n    from tools import bump\n    return bump()\nprint(f())').output).toEqual(['tools loaded', '1']);
  });

  it('runs an imported file once and shares it between importers', () => {
    const result = run('import tools\nimport nested\nprint(nested.twice(), tools.count)');
    expect(result.output).toEqual(['tools loaded', '3 2']);
    expect(run('import tools\nimport tools\nfrom tools import bump').output).toEqual(['tools loaded']);
  });

  it('keeps global variables separate per file', () => {
    const result = runSync('import tools\ncount = 100\ntools.bump()\nprint(count, tools.count)', { files });
    expect(result.output).toEqual(['tools loaded', '100 1']);
  });

  it('reports a missing file, name or attribute', () => {
    expect(run('import missing').error?.format()).toBe("ImportError: no code file named 'missing' (line 1)");
    expect(run('from tools import nothing').error?.message).toMatch(/cannot import name 'nothing'/);
    expect(run('import tools\ntools.nothing').error?.message).toMatch(/module 'tools' has no attribute 'nothing'/);
  });

  it('reports errors inside imported files with their file and line', () => {
    expect(run('import broken').error?.format()).toBe('ZeroDivisionError: division by zero (broken, line 2)');
    expect(run('x = 1\nimport broken').error).toMatchObject({ file: 'broken', line: 2 });
    expect(run('import syntax').error).toMatchObject({ pyType: 'SyntaxError', file: 'syntax', line: 1 });
    const inFunction = runSync('import tools\ntools.bump(1)', { files });
    expect(inFunction.error).toMatchObject({ file: null, line: 2 });
  });

  it('locates errors raised inside imported functions', () => {
    const result = runSync('import lib\nlib.fail()', { files: { lib: 'def fail():\n    return 1 / 0' } });
    expect(result.error?.format()).toBe('ZeroDivisionError: division by zero (lib, line 2)');
  });

  it('needs the Functions unlock', () => {
    const locked = createLockedUnlocks();
    expect(run('import tools', locked).error?.message).toMatch(/import.*Functions/);
    expect(run('import tools', { ...locked, Functions: 1 }).error?.message).not.toMatch(/Functions/);
  });
});

describe('unlocks', () => {
  const locked = createLockedUnlocks();
  const lockedErrorOf = (code: string, unlocks: UnlockLevels = locked) => runSync(code, { unlocks }).error;

  it('allows only harvest() and do_a_flip() on a new farm', () => {
    expect(lockedErrorOf('harvest()\ndo_a_flip()\n# a comment\nif True:\n    pass')).toBeNull();
  });

  it('rejects locked language features before running, with their line', () => {
    const error = lockedErrorOf('harvest()\nwhile True:\n    harvest()');
    expect(error?.pyType).toBe('LockedError');
    expect(error?.line).toBe(2);
    expect(error?.message).toMatch(/while.*Loops/);
    expect(lockedErrorOf('x = 1')?.message).toMatch(/Variables/);
    expect(lockedErrorOf('do_a_flip() if 1 + 1 else None')?.message).toMatch(/Operators/);
    expect(lockedErrorOf('def f():\n    pass')?.message).toMatch(/Functions/);
    expect(lockedErrorOf('[harvest()]')?.message).toMatch(/Lists/);
  });

  it('rejects locked functions and enum members', () => {
    expect(lockedErrorOf('move(North)')?.message).toMatch(/move.*Expand/);
    expect(lockedErrorOf('print(1)')?.message).toMatch(/Debug/);
    const withPlant = { ...locked, Plant: 1 };
    expect(lockedErrorOf('plant(Entities.Bush)', withPlant)).toBeNull();
    expect(lockedErrorOf('plant(Entities.Carrot)', withPlant)?.message).toMatch(/Entities\.Carrot.*Carrots/);
  });

  it('lets player-defined names shadow locked builtins', () => {
    const unlocks = { ...locked, Variables: 1, Debug: 1 };
    expect(lockedErrorOf('len = 3\nprint(len)', unlocks)).toBeNull();
  });

  it('runs freely once everything is unlocked', () => {
    expect(lockedErrorOf('x = [i * 2 for i in range(3)]\nprint(len(x))', createFullUnlocks())).toBeNull();
  });
});
