import { BoxGeometry, ConeGeometry, DodecahedronGeometry, OctahedronGeometry, type BufferGeometry } from 'three';
import type { BlockType } from '../core/state/types.ts';
import { LAYER_HEIGHT } from './layout.ts';
import { merge, part, seededRandom } from './models.ts';

/**
 * Low-poly mine blocks: a vertex-coloured cube with ore lumps or crystals poking out of its faces,
 * so each block type reads at a glance from the steep camera, like the farm's crops.
 */

/** Blocks are slightly smaller than a cell, leaving thin dark seams between them. */
export const BLOCK_SIZE = 0.97;
const HALF = BLOCK_SIZE / 2;
const HALF_HEIGHT = (LAYER_HEIGHT * BLOCK_SIZE) / 2;

type Vec3 = [number, number, number];

/** A random point on the top or a side face (never the bottom), with the face's outward normal. */
function facePoint(random: () => number, inset = 0.12): { position: Vec3; normal: Vec3 } {
  const face = Math.floor(random() * 5);
  const u = (random() * 2 - 1) * (HALF - inset);
  const v = (random() * 2 - 1) * (HALF_HEIGHT - inset);
  switch (face) {
    case 0:
      return { position: [u, HALF_HEIGHT, (random() * 2 - 1) * (HALF - inset)], normal: [0, 1, 0] };
    case 1:
      return { position: [HALF, v, u], normal: [1, 0, 0] };
    case 2:
      return { position: [-HALF, v, u], normal: [-1, 0, 0] };
    case 3:
      return { position: [u, v, HALF], normal: [0, 0, 1] };
    default:
      return { position: [u, v, -HALF], normal: [0, 0, -1] };
  }
}

function cube(color: string): BufferGeometry {
  return part(new BoxGeometry(BLOCK_SIZE, LAYER_HEIGHT * BLOCK_SIZE, BLOCK_SIZE), color);
}

/** Lumps pushed half-way out of the faces. */
function lumps(seed: number, count: number, colors: readonly string[], size: [number, number]): BufferGeometry[] {
  const random = seededRandom(seed);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const { position } = facePoint(random);
    const radius = size[0] + random() * (size[1] - size[0]);
    parts.push(
      part(new DodecahedronGeometry(radius, 0), colors[i % colors.length]!, {
        position,
        rotation: [random() * 3, random() * 3, random() * 3],
        scale: [1, 0.7 + random() * 0.5, 1],
      }),
    );
  }
  return parts;
}

/** Crystals sticking out of the faces along their normals. */
function crystals(seed: number, count: number, colors: readonly string[]): BufferGeometry[] {
  const random = seededRandom(seed);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const { position, normal } = facePoint(random, 0.18);
    const length = 0.16 + random() * 0.16;
    // Cones point up (+y); turn them to the face normal, with a little random lean.
    const lean = (random() - 0.5) * 0.6;
    const rotation: Vec3 =
      normal[1] === 1
        ? [lean, 0, lean * 0.5]
        : normal[0] !== 0
          ? [lean, 0, -normal[0] * (Math.PI / 2)]
          : [normal[2] * (Math.PI / 2), 0, lean];
    const offset: Vec3 = [position[0] + normal[0] * length * 0.3, position[1] + normal[1] * length * 0.3, position[2] + normal[2] * length * 0.3];
    parts.push(part(new ConeGeometry(0.05 + random() * 0.03, length, 5), colors[i % colors.length]!, { position: offset, rotation }));
  }
  return parts;
}

function createDirt(): BufferGeometry {
  return merge([cube('#8a5a33'), ...lumps(3, 7, ['#6e4526', '#9c6a3e'], [0.04, 0.07])]);
}

function createClay(): BufferGeometry {
  const random = seededRandom(9);
  const streaks: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const y = -HALF_HEIGHT + 0.2 + i * 0.28 + random() * 0.05;
    streaks.push(part(new BoxGeometry(BLOCK_SIZE + 0.012, 0.05, BLOCK_SIZE + 0.012), i % 2 === 0 ? '#c27a55' : '#8e4b31', { position: [0, y, 0] }));
  }
  return merge([cube('#a8613f'), ...streaks]);
}

function createStone(): BufferGeometry {
  return merge([cube('#8d8a84'), ...lumps(13, 6, ['#a3a09a', '#76736e'], [0.06, 0.1])]);
}

function createCoal(): BufferGeometry {
  return merge([cube('#77736e'), ...lumps(19, 9, ['#1d1b1a', '#2c2927', '#141312'], [0.05, 0.09])]);
}

function createIron(): BufferGeometry {
  return merge([cube('#86827c'), ...lumps(23, 8, ['#c0703a', '#d88a4a', '#9d5527'], [0.05, 0.085])]);
}

function createQuartz(): BufferGeometry {
  return merge([cube('#8a8790'), ...crystals(29, 9, ['#f4f1ff', '#e6d9f7', '#fbe9f0'])]);
}

/** Ruin: a block of carved sandstone with an inlaid band and a glyph on every side. */
function createRuin(): BufferGeometry {
  const parts: BufferGeometry[] = [
    cube('#d8b77a'),
    part(new BoxGeometry(BLOCK_SIZE + 0.02, 0.09, BLOCK_SIZE + 0.02), '#a8844c', { position: [0, HALF_HEIGHT - 0.12, 0] }),
    part(new BoxGeometry(BLOCK_SIZE + 0.02, 0.06, BLOCK_SIZE + 0.02), '#a8844c', { position: [0, -HALF_HEIGHT + 0.1, 0] }),
  ];
  for (let side = 0; side < 4; side++) {
    const angle = (side * Math.PI) / 2;
    const out = HALF + 0.012;
    const x = Math.sin(angle) * out;
    const z = Math.cos(angle) * out;
    parts.push(
      part(new BoxGeometry(0.06, 0.34, 0.02), '#7d5f33', { position: [x, 0, z], rotation: [0, angle, 0] }),
      part(new BoxGeometry(0.26, 0.06, 0.02), '#7d5f33', { position: [x, 0.08, z], rotation: [0, angle, 0] }),
      part(new OctahedronGeometry(0.06, 0), '#3ba89a', { position: [Math.sin(angle) * (out + 0.01), -0.1, Math.cos(angle) * (out + 0.01)] }),
    );
  }
  return merge(parts);
}

/** Rubble: what is left of a damaged ruin, a heap of broken sandstone and stone. */
function createRubble(): BufferGeometry {
  const random = seededRandom(37);
  const parts: BufferGeometry[] = [part(new BoxGeometry(BLOCK_SIZE, LAYER_HEIGHT * BLOCK_SIZE * 0.55, BLOCK_SIZE), '#8d7c62', { position: [0, -HALF_HEIGHT * 0.45, 0] })];
  for (let i = 0; i < 9; i++) {
    const size = 0.16 + random() * 0.16;
    parts.push(
      part(new BoxGeometry(size, size * 0.8, size), i % 3 === 0 ? '#c9a86e' : '#8f8a82', {
        position: [(random() - 0.5) * 0.7, -HALF_HEIGHT * 0.1 + random() * 0.3, (random() - 0.5) * 0.7],
        rotation: [random(), random() * 3, random()],
      }),
    );
  }
  return merge(parts);
}

export type SolidBlock = Exclude<BlockType, 'Air'>;

const BLOCK_FACTORIES: Record<SolidBlock, () => BufferGeometry> = {
  Dirt: createDirt,
  Clay: createClay,
  Stone: createStone,
  Coal: createCoal,
  Iron: createIron,
  Quartz: createQuartz,
  Ruin: createRuin,
  Rubble: createRubble,
};

export const SOLID_BLOCKS = Object.keys(BLOCK_FACTORIES) as SolidBlock[];

const blockCache = new Map<SolidBlock, BufferGeometry>();

export function getBlockGeometry(block: SolidBlock): BufferGeometry {
  let geometry = blockCache.get(block);
  if (!geometry) {
    geometry = BLOCK_FACTORIES[block]();
    blockCache.set(block, geometry);
  }
  return geometry;
}

/** Colour of the chips that fly when a block breaks. */
export const BLOCK_PARTICLE_COLORS: Record<BlockType, string> = {
  Air: '#000000',
  Dirt: '#8a5a33',
  Clay: '#a8613f',
  Stone: '#8d8a84',
  Coal: '#2c2927',
  Iron: '#c0703a',
  Quartz: '#f4f1ff',
  Ruin: '#d8b77a',
  Rubble: '#8d7c62',
};

/** Mushroom cap colours by colour index, ordered like a rainbow so sorted rows read as gradients. */
export const MUSHROOM_PALETTE: readonly string[] = [
  '#d8352f',
  '#ee6a2a',
  '#f2a02b',
  '#f4d23a',
  '#9ccc3a',
  '#3fb76a',
  '#2fb3b0',
  '#3a7fd8',
  '#6a4fd0',
  '#b24cc4',
];
