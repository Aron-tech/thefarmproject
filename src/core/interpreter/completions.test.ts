import { describe, expect, it } from 'vitest';
import type { UnlockLevels } from '../state/types.ts';
import { createFullUnlocks, createLockedUnlocks } from '../state/unlocks.ts';
import { collectNames, getCompletions, getSignatureHelp, type CompletionRequest } from './completions.ts';

function request(linePrefix: string, unlocks: UnlockLevels, extra: Partial<CompletionRequest> = {}): CompletionRequest {
  return { unlocks, linePrefix, source: linePrefix, fileName: 'main', files: {}, ...extra };
}

const labels = (linePrefix: string, unlocks: UnlockLevels, extra: Partial<CompletionRequest> = {}) =>
  getCompletions(request(linePrefix, unlocks, extra)).map((completion) => completion.label);

describe('completions', () => {
  it('offers only what a new farm has unlocked', () => {
    const offered = labels('ha', createLockedUnlocks());
    expect(offered).toEqual(expect.arrayContaining(['harvest', 'do_a_flip', 'if', 'Entities']));
    for (const locked of ['move', 'while', 'for', 'print', 'range', 'def', 'North', 'dig', 'Blocks', 'len']) {
      expect(offered).not.toContain(locked);
    }
  });

  it('adds features as they are unlocked', () => {
    const unlocks = { ...createLockedUnlocks(), Loops: 1, Expand: 1 };
    const offered = labels('', unlocks);
    expect(offered).toEqual(expect.arrayContaining(['while', 'for', 'range', 'move', 'North', 'West']));
    expect(offered).not.toContain('Up');
    expect(labels('', { ...unlocks, Mining: 1 })).toEqual(expect.arrayContaining(['Up', 'Down', 'dig', 'Blocks']));
  });

  it('filters enum members by their unlock', () => {
    const unlocks = { ...createLockedUnlocks(), Plant: 1 };
    expect(labels('plant(Entities.', unlocks)).toEqual(['Grass', 'Bush']);
    expect(labels('plant(Entities.', createFullUnlocks())).toContain('Mushroom');
    expect(labels('x = Blocks.', unlocks)).toEqual([]);
  });

  it('suggests the player\'s own names and their files', () => {
    const files = { main: '', tools: 'LIMIT = 3\ndef go(steps, direction=North):\n    pass' };
    const unlocks = createFullUnlocks();
    const source = 'import tools\ncount = 0\nfor x in range(3):\n    pass\n';
    expect(labels('co', unlocks, { source, files })).toEqual(expect.arrayContaining(['count', 'x', 'tools']));
    expect(labels('import ', unlocks, { files })).toEqual(['tools']);
    expect(labels('tools.', unlocks, { source, files })).toEqual(['LIMIT', 'go']);
    expect(labels('from tools import ', unlocks, { files })).toContain('go');
    expect(labels('import ', createLockedUnlocks(), { files })).toEqual([]);
  });

  it('inserts calls and blocks as snippets', () => {
    const completions = getCompletions(request('', createFullUnlocks()));
    expect(completions.find((c) => c.label === 'move')?.insertSnippet).toBe('move(${1:direction})$0');
    expect(completions.find((c) => c.label === 'harvest')?.insertSnippet).toBe('harvest()$0');
    expect(completions.find((c) => c.label === 'while')?.insertSnippet).toBe('while ${1:True}:\n\t$0');
  });

  it('ranks the game functions above plain Python builtins', () => {
    const completions = getCompletions(request('di', createFullUnlocks()));
    const rank = (label: string) => completions.find((c) => c.label === label)?.rank;
    expect(rank('dig')).toBeLessThan(rank('dict')!);
    expect(rank('print')).toBe(rank('harvest'));
  });

  it('stays quiet in comments and strings', () => {
    expect(labels('# har', createFullUnlocks())).toEqual([]);
    expect(labels('print("har', createFullUnlocks())).toEqual([]);
  });

  it('collects names from half-typed code', () => {
    expect(collectNames('def f(a, b=2\nx, y = 1, 2\nz += 1').map((entry) => entry.name)).toEqual(['f', 'a', 'b', 'x', 'y', 'z']);
  });
});

describe('signature help', () => {
  it('shows the signature and active parameter of unlocked calls', () => {
    const help = getSignatureHelp(request('move(', createFullUnlocks()));
    expect(help).toMatchObject({ label: 'move(direction)', activeParam: 0 });
    expect(getSignatureHelp(request('move(', createLockedUnlocks()))).toBeNull();
    const own = getSignatureHelp(request('go(1, [2, 3], ', createFullUnlocks(), { source: 'def go(a, b, c):\n    pass' }));
    expect(own).toMatchObject({ label: 'go(a, b, c)', activeParam: 2 });
  });
});
