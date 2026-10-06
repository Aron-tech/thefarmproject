import { useGame, useGameState } from './gameContext.ts';

/**
 * Layer picker on the left edge, shown once the mine exists: the farm and every mine layer, the drone's
 * layer marked. Picking a layer focuses the view on it (upper layers fade out); "Follow" tracks the drone.
 */
export function DepthControl() {
  const { store } = useGame();
  const layers = useGameState((s) => s.game.mine?.layers ?? 0);
  const droneDepth = useGameState((s) => s.game.drone.depth);
  const viewDepth = useGameState((s) => s.viewDepth);
  if (layers === 0) return null;
  const focus = Math.min(viewDepth ?? droneDepth, layers);
  const depths = Array.from({ length: layers + 1 }, (_, depth) => depth);

  return (
    <nav className="farm-depth absolute top-24 left-4 z-[5] flex flex-col gap-1" aria-label="Mine layers">
      <button
        type="button"
        className={`farm-depth-button ${viewDepth === null ? 'farm-depth-button-active' : ''}`}
        title="Follow the drone up and down"
        onClick={() => store.setState({ viewDepth: null })}
      >
        Follow
      </button>
      {depths.map((depth) => (
        <button
          key={depth}
          type="button"
          className={`farm-depth-button ${depth === focus ? 'farm-depth-button-focus' : ''}`}
          title={depth === 0 ? 'The farm' : `Mine layer ${depth}`}
          onClick={() => store.setState({ viewDepth: depth })}
        >
          <span>{depth === 0 ? 'Farm' : depth}</span>
          {depth === droneDepth && <span className="farm-depth-drone" aria-label="drone here" />}
        </button>
      ))}
    </nav>
  );
}
