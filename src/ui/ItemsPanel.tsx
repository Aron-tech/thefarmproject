import { ITEM_TYPES } from '../core/state/types.ts';
import { formatCount } from './formatCount.ts';
import { ItemIcon } from './icons.tsx';
import { useGameState } from './gameContext.ts';

/** Resource bar in the top-left corner: an icon per item with its count underneath, as in the game. */
export function ItemsPanel() {
  const inventory = useGameState((s) => s.game.inventory);
  return (
    <ul className="pointer-events-none absolute top-3 left-4 z-[5] flex gap-4">
      {ITEM_TYPES.map((item) => (
        <li key={item} className="flex w-12 flex-col items-center" title={item}>
          <ItemIcon item={item} />
          <span className="farm-item-count">{formatCount(inventory[item])}</span>
        </li>
      ))}
    </ul>
  );
}
