import { describe, expect, it } from 'vitest';
import { applyAction } from './actions.ts';
import { addFile, addFolder, createWorkspace, moveFileToFolder, renameFile } from './codeFiles.ts';
import { createGameState } from './gameState.ts';
import { createSaveData, parseSaveJson, SaveFormatError, serializeSave } from './save.ts';
import { buyUnlock } from './unlocks.ts';

describe('save data', () => {
  it('round-trips through JSON', () => {
    const game = applyAction(createGameState(3), { kind: 'till' }, 500).state;
    const data = createSaveData(game, createWorkspace('move(North)'));
    expect(parseSaveJson(serializeSave(data))).toEqual(data);
  });

  it('keeps unlocks, power and sunflower petals', () => {
    const start = createGameState();
    const rich = { ...start, inventory: { ...start.inventory, Hay: 100, Power: 3 }, poweredActions: 7 };
    const unlocked = buyUnlock(rich, 'Loops')!;
    const withSunflower = {
      ...unlocked,
      cells: [{ ground: 'Soil' as const, entity: { type: 'Sunflower' as const, plantedAt: 0, growTicks: 5, petals: 9 } }],
    };
    const parsed = parseSaveJson(serializeSave(createSaveData(withSunflower, createWorkspace('')))).game;
    expect(parsed.unlocks.Loops).toBe(1);
    expect(parsed.inventory.Power).toBe(3);
    expect(parsed.poweredActions).toBe(7);
    expect(parsed.cells[0]!.entity?.petals).toBe(9);
  });

  it('fills in missing inventory items and unlocks with zero', () => {
    const data = JSON.parse(serializeSave(createSaveData(createGameState(3), createWorkspace(''))));
    delete data.game.inventory.Carrot;
    delete data.game.unlocks.Speed;
    const parsed = parseSaveJson(JSON.stringify(data));
    expect(parsed.game.inventory.Carrot).toBe(0);
    expect(parsed.game.unlocks.Speed).toBe(0);
  });

  it('migrates version 1 saves, unlocking what was available before the unlock tree', () => {
    const current = JSON.parse(serializeSave(createSaveData(createGameState(5), createWorkspace(''))));
    delete current.game.unlocks;
    delete current.game.poweredActions;
    const legacy = { version: 1, savedAt: current.savedAt, code: 'while True:\n    harvest()', speed: 1000, game: current.game };
    const parsed = parseSaveJson(JSON.stringify(legacy));
    expect(parsed.version).toBe(3);
    expect(parsed.workspace).toEqual(createWorkspace('while True:\n    harvest()'));
    expect(parsed.game.worldSize).toBe(5);
    expect(parsed.game.unlocks).toMatchObject({ Loops: 1, Senses: 1, Variables: 1, Carrots: 1, Expand: 3, Speed: 0, Sunflowers: 0 });
    expect(parsed.game.poweredActions).toBe(0);
  });

  it('migrates version 2 saves: the program becomes the main file', () => {
    const current = JSON.parse(serializeSave(createSaveData(createGameState(3), createWorkspace(''))));
    const v2 = { version: 2, savedAt: current.savedAt, code: 'harvest()', game: current.game };
    expect(parseSaveJson(JSON.stringify(v2)).workspace).toEqual(createWorkspace('harvest()'));
  });

  it('keeps code files and folders', () => {
    let workspace = addFile(createWorkspace('import tools'), 'f1');
    workspace = renameFile(workspace, 'f1', 'tools');
    workspace = addFolder(workspace)[0];
    workspace = moveFileToFolder(workspace, 'f1', 'New folder');
    const parsed = parseSaveJson(serializeSave(createSaveData(createGameState(3), workspace)));
    expect(parsed.workspace).toEqual(workspace);
  });

  it('rejects malformed or tampered saves', () => {
    const valid = JSON.parse(serializeSave(createSaveData(createGameState(3), createWorkspace(''))));
    const broken = (mutate: (data: typeof valid) => void) => {
      const copy = structuredClone(valid);
      mutate(copy);
      return () => parseSaveJson(JSON.stringify(copy));
    };

    expect(() => parseSaveJson('not json')).toThrow(SaveFormatError);
    expect(broken((d) => (d.version = 99))).toThrow(/version/);
    expect(broken((d) => d.game.cells.pop())).toThrow(/game\.cells/);
    expect(broken((d) => (d.game.cells[0].ground = 'Lava'))).toThrow(/ground/);
    expect(broken((d) => (d.game.drone.pos.x = 7))).toThrow(/pos\.x/);
    expect(broken((d) => (d.game.inventory.Hay = -1))).toThrow(/Hay/);
    expect(broken((d) => (d.game.worldSize = 1000))).toThrow(/worldSize/);
    expect(broken((d) => (d.game.unlocks.Loops = 99))).toThrow(/unlocks\.Loops/);
    expect(broken((d) => (d.workspace.files[0].name = 'not a name'))).toThrow(/workspace\.files\[0\]\.name/);
    expect(broken((d) => (d.workspace.files = []))).toThrow(/main file/);
  });
});
