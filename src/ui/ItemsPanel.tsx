import { ITEM_TYPES, type GameState, type ItemType, type UnlockId } from '../core/state/types.ts';
import { formatCount } from './formatCount.ts';
import { ItemIcon } from './icons.tsx';
import { useGameState } from './gameContext.ts';

/** Unlock that introduces each item; Hay is there from the start. */
const ITEM_UNLOCKS: Record<ItemType, UnlockId | null> = {
  Hay: null,
  Wood: 'Plant',
  Carrot: 'Carrots',
  Power: 'Sunflowers',
};

function isItemShown(game: GameState, item: ItemType): boolean {
  const unlock = ITEM_UNLOCKS[item];
  return game.inventory[item] > 0 || unlock === null || game.unlocks[unlock] > 0;
}

/** Resource bar in the top-left corner: an icon per known item with its count underneath, as in the game. */
export function ItemsPanel() {
  const game = useGameState((s) => s.game);
  return (
    <ul className="pointer-events-none absolute top-3 left-4 z-[5] flex gap-4">
      {ITEM_TYPES.filter((item) => isItemShown(game, item)).map((item) => (
        <li key={item} className="flex w-12 flex-col items-center" title={item}>
          <ItemIcon item={item} />
          <span className="farm-item-count">{formatCount(game.inventory[item])}</span>
        </li>
      ))}
    </ul>
  );
}
