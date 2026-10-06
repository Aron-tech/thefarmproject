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

/** Height of a mine layer; each block is a cube of this size. */
export const LAYER_HEIGHT = 1;
/** Gap between mine layers, so the layers read as separate slices. */
export const LAYER_GAP = 0.12;
/** Gap between the farm tiles and the first layer. */
const MINE_TOP_GAP = 0.05;

/** Top face of mine layer `depth` (1-based). */
export function layerTop(depth: number): number {
  return -TILE_HEIGHT - MINE_TOP_GAP - (depth - 1) * (LAYER_HEIGHT + LAYER_GAP);
}

/** Floor of mine layer `depth`, where mushrooms grow and the drone flies above. */
export function layerFloor(depth: number): number {
  return layerTop(depth) - LAYER_HEIGHT;
}

/** Height the camera centres on when looking at a depth (0 = the farm). */
export function focusHeight(depth: number): number {
  return depth === 0 ? 0 : layerFloor(depth) + LAYER_HEIGHT / 2;
}
