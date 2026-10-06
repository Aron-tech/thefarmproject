import { useState } from 'react';
import { UNLOCK_IDS, type ItemType, type UnlockId } from '../core/state/types.ts';
import {
  canAfford,
  canBuyUnlock,
  isUnlockVisible,
  maxUnlockLevel,
  MINE_TREE_FIRST_ROW,
  nextUnlockCost,
  UNLOCK_DEFS,
  type ItemCost,
} from '../core/state/unlocks.ts';
import { formatCount } from './formatCount.ts';
import { useGame, useGameState } from './gameContext.ts';
import { CloseIcon, ItemIcon } from './icons.tsx';

const NODE_WIDTH = 150;
const NODE_HEIGHT = 74;
const COLUMN_GAP = 46;
const ROW_GAP = 22;

const nodeLeft = (id: UnlockId) => UNLOCK_DEFS[id].treePos.col * (NODE_WIDTH + COLUMN_GAP);
const nodeTop = (id: UnlockId) => UNLOCK_DEFS[id].treePos.row * (NODE_HEIGHT + ROW_GAP);
const TREE_WIDTH = Math.max(...UNLOCK_IDS.map(nodeLeft)) + NODE_WIDTH;
const isMineUnlock = (id: UnlockId) => UNLOCK_DEFS[id].treePos.row >= MINE_TREE_FIRST_ROW;
/** The mine section's title sits in the empty row above its first row. */
const SECTION_TOP = (MINE_TREE_FIRST_ROW - 1) * (NODE_HEIGHT + ROW_GAP) + NODE_HEIGHT / 2;

function CostList({ cost, affordable }: { cost: ItemCost; affordable: (item: ItemType, amount: number) => boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      {(Object.entries(cost) as [ItemType, number][]).map(([item, amount]) => (
        <span key={item} className={`flex items-center gap-0.5 ${affordable(item, amount) ? 'text-white' : 'text-[#f26a32]'}`}>
          <ItemIcon item={item} className="h-5 w-5" />
          {formatCount(amount)}
        </span>
      ))}
    </span>
  );
}

/**
 * The unlock tree, opened from the toolbar like the game's research screen: a node per upgrade,
 * connected to its parents. Nodes appear once their parents are bought; clicking buys the next level.
 */
export function UnlockTree({ onClose }: { onClose: () => void }) {
  const { loop } = useGame();
  const game = useGameState((s) => s.game);
  const [hovered, setHovered] = useState<UnlockId | null>(null);
  const visible = UNLOCK_IDS.filter((id) => isUnlockVisible(game.unlocks, id));
  const described = hovered ?? visible.find((id) => canBuyUnlock(game, id)) ?? null;
  const showMine = visible.some(isMineUnlock);
  const treeHeight = Math.max(...visible.map(nodeTop)) + NODE_HEIGHT;

  return (
    <div className="absolute inset-0 z-[40] flex items-center justify-center bg-black/35 p-4" onPointerDown={onClose}>
      <div
        className="farm-window flex max-h-full max-w-full flex-col"
        role="dialog"
        aria-label="Unlocks"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="farm-window-titlebar flex h-[38px] items-center justify-between pr-1 pl-3">
          <span className="farm-window-title">Unlocks</span>
          <button type="button" className="farm-square-button farm-square-button-alert h-7 w-7" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="farm-window-body flex min-h-0 flex-col">
          <div className="min-h-0 overflow-auto p-5">
            <div className="relative" style={{ width: TREE_WIDTH, height: treeHeight }}>
              {showMine && (
                <div className="farm-unlock-section absolute right-0 left-0 flex items-center gap-3" style={{ top: SECTION_TOP - 12 }}>
                  <span>The Miner Was Replaced</span>
                  <span className="h-px flex-1 bg-[#5a5a5a]" />
                </div>
              )}
              <svg className="pointer-events-none absolute inset-0" width={TREE_WIDTH} height={treeHeight} aria-hidden>
                {visible.flatMap((id) =>
                  // Links into the mine section from the farm tree are implied by the section itself.
                  UNLOCK_DEFS[id].parents.filter((parent) => isMineUnlock(parent) === isMineUnlock(id)).map((parent) => {
                    const x1 = nodeLeft(parent) + NODE_WIDTH;
                    const y1 = nodeTop(parent) + NODE_HEIGHT / 2;
                    const x2 = nodeLeft(id);
                    const y2 = nodeTop(id) + NODE_HEIGHT / 2;
                    const midX = (x1 + x2) / 2;
                    return (
                      <path
                        key={`${parent}-${id}`}
                        d={`M${x1} ${y1}H${midX}V${y2}H${x2}`}
                        fill="none"
                        stroke={game.unlocks[id] > 0 ? '#6f9216' : '#5a5a5a'}
                        strokeWidth={3}
                      />
                    );
                  }),
                )}
              </svg>
              {visible.map((id) => {
                const level = game.unlocks[id];
                const max = maxUnlockLevel(id);
                const cost = nextUnlockCost(game.unlocks, id);
                const buyable = canBuyUnlock(game, id);
                const state = cost === null ? 'maxed' : buyable ? 'buyable' : level > 0 ? 'owned' : 'locked';
                return (
                  <button
                    key={id}
                    type="button"
                    className={`farm-unlock-node farm-unlock-node-${state} absolute flex flex-col items-start justify-between px-2.5 py-2 text-left`}
                    style={{ left: nodeLeft(id), top: nodeTop(id), width: NODE_WIDTH, height: NODE_HEIGHT }}
                    disabled={!buyable}
                    onClick={() => loop.buyUnlock(id)}
                    onPointerEnter={() => setHovered(id)}
                    onPointerLeave={() => setHovered((current) => (current === id ? null : current))}
                    onFocus={() => setHovered(id)}
                  >
                    <span className="flex w-full items-baseline justify-between gap-1">
                      <span className="text-[15px] font-bold">{id}</span>
                      {max > 1 && (
                        <span className="text-xs font-semibold text-stone-300">
                          {level}/{max}
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] font-semibold">
                      {cost === null ? (
                        <span className="text-stone-300">{max > 1 ? 'Max level' : 'Unlocked'}</span>
                      ) : (
                        <CostList cost={cost} affordable={(item, amount) => canAfford(game.inventory, { [item]: amount })} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-h-[52px] border-t border-[#333] px-5 py-3 text-sm text-stone-200">
            {described ? (
              <>
                <span className="font-bold text-white">{described}: </span>
                {UNLOCK_DEFS[described].description}
              </>
            ) : (
              <span className="text-stone-400">Harvest more to unlock new upgrades.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
