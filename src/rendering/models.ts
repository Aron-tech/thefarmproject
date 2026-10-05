import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { nextRandom } from '../core/state/random.ts';
import type { EntityType } from '../core/state/types.ts';

/**
 * Low-poly models built from primitives, styled after the game's look. Every part carries vertex colours,
 * so a multi-coloured model is a single geometry and can be drawn with one InstancedMesh.
 */

interface PartTransform {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

function part(geometry: BufferGeometry, color: string, { position, rotation, scale }: PartTransform = {}): BufferGeometry {
  const prepared = geometry.index ? geometry.toNonIndexed() : geometry;
  prepared.deleteAttribute('uv');
  prepared.applyMatrix4(
    new Matrix4().compose(
      new Vector3(...(position ?? [0, 0, 0])),
      new Quaternion().setFromEuler(new Euler(...(rotation ?? [0, 0, 0]))),
      new Vector3(...(scale ?? [1, 1, 1])),
    ),
  );
  const rgb = new Color(color);
  const count = prepared.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = rgb.r;
    colors[i * 3 + 1] = rgb.g;
    colors[i * 3 + 2] = rgb.b;
  }
  prepared.setAttribute('color', new BufferAttribute(colors, 3));
  return prepared;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('Failed to merge model geometry');
  merged.computeVertexNormals();
  return merged;
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    const [value, next] = nextRandom(state);
    state = next;
    return value;
  };
}

/** Grass: a dense patch of thin golden straw stalks, some with a wheat-like head. */
function createGrass(): BufferGeometry {
  const random = seededRandom(5);
  const stalkColors = ['#f2b844', '#e8a53a', '#f7c95e', '#dc9632', '#fbd56c'];
  const parts: BufferGeometry[] = [];
  const STALKS = 72;
  for (let i = 0; i < STALKS; i++) {
    const height = 0.4 + random() * 0.34;
    const x = (random() - 0.5) * 0.84;
    const z = (random() - 0.5) * 0.84;
    const tiltX = (random() - 0.5) * 0.22;
    const tiltZ = (random() - 0.5) * 0.22;
    const color = stalkColors[Math.floor(random() * stalkColors.length)]!;
    parts.push(
      part(new CylinderGeometry(0.014, 0.02, height, 4, 1, true), color, {
        position: [x, height / 2, z],
        rotation: [tiltX, random() * Math.PI, tiltZ],
      }),
    );
    if (random() < 0.45) {
      // Wheat-like head at the top of the stalk.
      parts.push(
        part(new CylinderGeometry(0.026, 0.016, 0.1, 4), '#fcd877', {
          position: [x + tiltZ * -height * 0.5, height + 0.03, z + tiltX * height * 0.5],
          rotation: [tiltX, 0, tiltZ],
        }),
      );
    }
  }
  return merge(parts);
}

/** Bush: a faceted olive shrub made of several lumps. */
function createBush(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.035, 0.05, 0.12, 5), '#5a3519', { position: [0, 0.06, 0] }),
    part(new IcosahedronGeometry(0.27, 0), '#6c9124', { position: [0, 0.3, 0], rotation: [0.3, 0.2, 0] }),
    part(new IcosahedronGeometry(0.2, 0), '#7da22c', { position: [0.17, 0.25, 0.1], rotation: [0.8, 0.1, 0.4] }),
    part(new IcosahedronGeometry(0.19, 0), '#5f8420', { position: [-0.16, 0.23, -0.08], rotation: [0.2, 0.9, 0.3] }),
    part(new IcosahedronGeometry(0.17, 0), '#86aa34', { position: [-0.05, 0.47, 0.06], rotation: [0.5, 0.4, 0.9] }),
    part(new IcosahedronGeometry(0.15, 0), '#6c9124', { position: [0.08, 0.2, -0.2], rotation: [1.1, 0.3, 0.2] }),
  ]);
}

/** One small carrot plant: an orange shoulder in the soil and a few leaves. */
function carrotPlant(offsetX: number, offsetZ: number, yaw: number): BufferGeometry[] {
  const leaves: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = yaw + (i / 4) * Math.PI * 2;
    leaves.push(
      part(new ConeGeometry(0.05, 0.2, 4), i % 2 === 0 ? '#4d8a24' : '#5f9e2e', {
        position: [offsetX + Math.cos(angle) * 0.04, 0.12, offsetZ + Math.sin(angle) * 0.04],
        rotation: [Math.sin(angle) * 0.6, 0, -Math.cos(angle) * 0.6],
        scale: [1, 1, 0.4],
      }),
    );
  }
  return [
    part(new ConeGeometry(0.055, 0.12, 6), '#e8792a', { position: [offsetX, 0.02, offsetZ], rotation: [Math.PI, yaw, 0] }),
    ...leaves,
  ];
}

/** Carrots grow as a 2×2 cluster of small plants per tile. */
function createCarrot(): BufferGeometry {
  return merge([
    ...carrotPlant(-0.2, -0.2, 0.2),
    ...carrotPlant(0.2, -0.2, 1.1),
    ...carrotPlant(-0.2, 0.2, 2.3),
    ...carrotPlant(0.2, 0.2, 0.7),
  ]);
}

const PLANT_FACTORIES: Record<EntityType, () => BufferGeometry> = {
  Grass: createGrass,
  Bush: createBush,
  Carrot: createCarrot,
};

const plantCache = new Map<EntityType, BufferGeometry>();

export function getPlantGeometry(type: EntityType): BufferGeometry {
  let geometry = plantCache.get(type);
  if (!geometry) {
    geometry = PLANT_FACTORIES[type]();
    plantCache.set(type, geometry);
  }
  return geometry;
}

/** Colour of the bits that fly off when a plant is harvested (alongside white puffs). */
export const PLANT_PARTICLE_COLORS: Record<EntityType, string> = {
  Grass: '#ecb64c',
  Bush: '#6c9124',
  Carrot: '#e8792a',
};

export function createPuffGeometry(): BufferGeometry {
  return new DodecahedronGeometry(1, 0);
}

export function createDebrisGeometry(): BufferGeometry {
  return new BoxGeometry(1, 1, 1);
}

// ---------------------------------------------------------------- drone

const DRONE_ARM_COLOR = '#4a3624';
const DRONE_ARM_LENGTH = 0.62;
export const DRONE_ROTOR_DISTANCE = 0.62;

/** Drone frame: a small core with four long, dark diagonal arms ending in motor housings. */
export function createDroneBody(): BufferGeometry {
  const arms: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const cx = Math.cos(angle) * (DRONE_ARM_LENGTH / 2);
    const cz = Math.sin(angle) * (DRONE_ARM_LENGTH / 2);
    arms.push(
      part(new BoxGeometry(DRONE_ARM_LENGTH, 0.045, 0.06), DRONE_ARM_COLOR, {
        position: [cx, -0.02, cz],
        rotation: [0, -angle, 0],
      }),
      part(new CylinderGeometry(0.05, 0.06, 0.08, 6), '#3a2a1c', {
        position: [Math.cos(angle) * DRONE_ROTOR_DISTANCE, 0, Math.sin(angle) * DRONE_ROTOR_DISTANCE],
      }),
    );
  }
  return merge([part(new CylinderGeometry(0.17, 0.14, 0.14, 8), '#6b4d30', { position: [0, -0.04, 0] }), ...arms]);
}

/** The drone's octagonal straw hat, the most recognisable part of the drone. */
export function createStrawHat(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.34, 0.36, 0.05, 8), '#f0a943'),
    part(new CylinderGeometry(0.3, 0.34, 0.03, 8), '#e59a35', { position: [0, 0.035, 0] }),
    part(new CylinderGeometry(0.17, 0.2, 0.13, 8), '#f4b552', { position: [0, 0.11, 0] }),
    part(new CylinderGeometry(0.205, 0.205, 0.035, 8), '#d98a2c', { position: [0, 0.065, 0] }),
    part(new CylinderGeometry(0.1, 0.16, 0.05, 8), '#f7c066', { position: [0, 0.2, 0] }),
    part(new SphereGeometry(0.05, 8, 4), '#e8a040', { position: [0, 0.23, 0] }),
  ]);
}

/** Two-bladed propeller with a hub. */
export function createRotor(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.025, 0.025, 0.05, 6), '#2e2116'),
    part(new BoxGeometry(0.46, 0.012, 0.055), '#3d2c1d', { position: [0, 0.03, 0], rotation: [0.12, 0, 0] }),
  ]);
}
