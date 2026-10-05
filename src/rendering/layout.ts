/** Maps a grid cell to scene coordinates [x, z], centred on the origin. North points towards -z. */
export function cellToWorld(x: number, y: number, worldSize: number): [number, number] {
  const offset = (worldSize - 1) / 2;
  return [x - offset, -(y - offset)];
}

/** Height of a single ground tile; its top face is at y = 0. */
export const TILE_HEIGHT = 0.12;
/** Gap between neighbouring tiles, showing the darker slab underneath. */
export const TILE_GAP = 0.03;
/** Thickness of the floating slab the farm sits on. */
export const SLAB_DEPTH = 0.42;
