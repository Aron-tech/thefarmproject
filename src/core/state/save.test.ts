import { describe, expect, it } from 'vitest';
import { applyAction } from './actions.ts';
import { createGameState } from './gameState.ts';
import { createSaveData, parseSaveJson, SaveFormatError, serializeSave } from './save.ts';

describe('save data', () => {
  it('round-trips through JSON', () => {
    const game = applyAction(createGameState(3), { kind: 'till' }, 500).state;
    const data = createSaveData(game, 'move(North)', null);
    expect(parseSaveJson(serializeSave(data))).toEqual(data);
  });

  it('fills in missing inventory items with zero', () => {
    const data = JSON.parse(serializeSave(createSaveData(createGameState(3), '', 1000)));
    delete data.game.inventory.Carrot;
    expect(parseSaveJson(JSON.stringify(data)).game.inventory.Carrot).toBe(0);
  });

  it('rejects malformed or tampered saves', () => {
    const valid = JSON.parse(serializeSave(createSaveData(createGameState(3), '', 1000)));
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
  });
});
