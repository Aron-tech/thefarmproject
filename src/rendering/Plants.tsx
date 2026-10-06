import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, Euler, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type Group, type InstancedMesh } from 'three';
import { getGrowthProgress } from '../core/state/crops.ts';
import { ENTITY_TYPES, type Cell, type EntityType, type GameState } from '../core/state/types.ts';
import type { GameLoop } from '../game/GameLoop.ts';
import type { GameStore } from '../game/gameStore.ts';
import { cellToWorld } from './layout.ts';
import { fadeMaterial, getFocusDepth } from './viewDepth.ts';
import { createDebrisGeometry, createPuffGeometry, getPlantGeometry, PLANT_PARTICLE_COLORS } from './models.ts';

/** Plants being removed keep rendering briefly (pop + shrink); at most this many at once. */
const MAX_GHOSTS = 96;
const GHOST_DURATION = 0.3;
const SPAWN_DURATION = 0.35;
const MAX_PUFFS = 240;
const MAX_DEBRIS = 400;
const PUFFS_PER_HARVEST = 5;
const DEBRIS_PER_HARVEST = 6;
const PUFF_LIFETIME = 0.55;
const DEBRIS_LIFETIME = 0.75;
const GRAVITY = 7;

interface Ghost {
  type: EntityType;
  cellIndex: number;
  progress: number;
  start: number;
}

interface Particle {
  position: Vector3;
  velocity: Vector3;
  color: Color;
  start: number;
  size: number;
  spin: number;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

/** Stable pseudo-random value in [0, 1) per cell, for yaw and sway phase variation. */
function cellHash(index: number): number {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Growth-dependent size: grass mostly grows taller, other crops grow uniformly. */
function growthScale(type: EntityType, progress: number, out: Vector3): Vector3 {
  const eased = easeOutCubic(progress);
  if (type === 'Grass') return out.set(0.8 + 0.2 * eased, 0.12 + 0.88 * eased, 0.8 + 0.2 * eased);
  const s = 0.2 + 0.8 * eased;
  return out.set(s, s, s);
}

/** Young plants are tinted towards green / dull; ripe ones show their full colour. */
const UNRIPE_TINTS: Record<EntityType, Color> = {
  Grass: new Color(0.55, 0.95, 0.38),
  Bush: new Color(0.8, 0.85, 0.7),
  Carrot: new Color(0.8, 0.85, 0.7),
  Sunflower: new Color(0.75, 0.9, 0.6),
  Rice: new Color(0.7, 0.95, 0.6),
  Mushroom: new Color(0.8, 0.8, 0.8),
};
const WHITE = new Color(1, 1, 1);
const PUFF_COLOR = new Color('#f4efe4');

/**
 * Renders every crop with one InstancedMesh per type and animates them each frame: growth, a springy
 * pop when planted, a pop-and-shrink with white puffs and debris when harvested, and a gentle sway.
 * Reads the latest state straight from the game loop, so animation does not depend on React renders.
 */
export function Plants({ loop, store, worldSize }: { loop: GameLoop; store: GameStore; worldSize: number }) {
  const meshRefs = useRef<Partial<Record<EntityType, InstancedMesh | null>>>({});
  const puffRef = useRef<InstancedMesh>(null);
  const debrisRef = useRef<InstancedMesh>(null);
  const groupRef = useRef<Group>(null);
  const capacity = worldSize * worldSize + MAX_GHOSTS;

  const runtime = useRef({
    lastCells: null as readonly Cell[] | null,
    lastWorldSize: worldSize,
    spawnTimes: new Map<number, number>(),
    ghosts: [] as Ghost[],
    puffs: [] as Particle[],
    debris: [] as Particle[],
    opacity: 1,
  });

  const resources = useMemo(
    () => ({
      plantMaterial: new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75 }),
      puffGeometry: createPuffGeometry(),
      puffMaterial: new MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }),
      debrisGeometry: createDebrisGeometry(),
      debrisMaterial: new MeshStandardMaterial({ roughness: 0.8 }),
      puffColors: new Float32Array(MAX_PUFFS * 3),
      debrisColors: new Float32Array(MAX_DEBRIS * 3),
    }),
    [],
  );
  const colorArrays = useMemo(
    () => Object.fromEntries(ENTITY_TYPES.map((type) => [type, new Float32Array(capacity * 3)])) as Record<EntityType, Float32Array>,
    [capacity],
  );

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;
    // Crops fade out with the farm tiles while the view is in the mine.
    const rtFade = runtime.current;
    rtFade.opacity = fadeMaterial(resources.plantMaterial, rtFade.opacity, getFocusDepth(store, loop) > 0 ? 0 : 1, delta);
    if (groupRef.current) groupRef.current.visible = rtFade.opacity > 0.01;
    const game: GameState = loop.getState();
    const rt = runtime.current;
    if (game.worldSize !== rt.lastWorldSize) {
      rt.lastCells = null;
      rt.lastWorldSize = game.worldSize;
      rt.spawnTimes.clear();
      rt.ghosts = [];
    }
    if (rt.lastCells && rt.lastCells !== game.cells) detectChanges(rt.lastCells, game, now, rt);
    rt.lastCells = game.cells;

    writePlantInstances(game, now, rt, meshRefs.current);
    writeParticles(now, rt.puffs, puffRef.current, PUFF_LIFETIME, 0);
    writeParticles(now, rt.debris, debrisRef.current, DEBRIS_LIFETIME, GRAVITY);
  });

  return (
    <group ref={groupRef}>
      {ENTITY_TYPES.map((type) => (
        <instancedMesh
          key={`${type}-${capacity}`}
          ref={(mesh) => {
            meshRefs.current[type] = mesh;
          }}
          args={[getPlantGeometry(type), resources.plantMaterial, capacity]}
          castShadow
          receiveShadow
          frustumCulled={false}
        >
          <instancedBufferAttribute attach="instanceColor" args={[colorArrays[type], 3]} />
        </instancedMesh>
      ))}
      <instancedMesh ref={puffRef} args={[resources.puffGeometry, resources.puffMaterial, MAX_PUFFS]} frustumCulled={false}>
        <instancedBufferAttribute attach="instanceColor" args={[resources.puffColors, 3]} />
      </instancedMesh>
      <instancedMesh ref={debrisRef} args={[resources.debrisGeometry, resources.debrisMaterial, MAX_DEBRIS]} frustumCulled={false}>
        <instancedBufferAttribute attach="instanceColor" args={[resources.debrisColors, 3]} />
      </instancedMesh>
    </group>
  );
}

type Runtime = { spawnTimes: Map<number, number>; ghosts: Ghost[]; puffs: Particle[]; debris: Particle[] };

function detectChanges(previous: readonly Cell[], game: GameState, now: number, rt: Runtime): void {
  const cells = game.cells;
  for (let i = 0; i < cells.length; i++) {
    const before = previous[i]?.entity ?? null;
    const after = cells[i]!.entity;
    if (before === after) continue;
    const replaced = before !== null && (!after || after.type !== before.type || after.plantedAt !== before.plantedAt);
    if (before && replaced) {
      if (rt.ghosts.length < MAX_GHOSTS) {
        rt.ghosts.push({ type: before.type, cellIndex: i, progress: getGrowthProgress(before, game.tick), start: now });
      }
      burst(rt, i, game.worldSize, PLANT_PARTICLE_COLORS[before.type], now);
    }
    if (after && (!before || replaced)) rt.spawnTimes.set(i, now);
  }
}

function pushCapped(list: Particle[], particle: Particle, max: number): void {
  if (list.length >= max) list.shift();
  list.push(particle);
}

function burst(rt: Runtime, cellIndex: number, worldSize: number, color: string, now: number): void {
  const [wx, wz] = cellToWorld(cellIndex % worldSize, Math.floor(cellIndex / worldSize), worldSize);
  const tint = new Color(color);
  for (let i = 0; i < PUFFS_PER_HARVEST; i++) {
    const angle = (i / PUFFS_PER_HARVEST) * Math.PI * 2 + Math.random();
    const speed = 0.5 + Math.random() * 0.5;
    pushCapped(
      rt.puffs,
      {
        position: new Vector3(wx + Math.cos(angle) * 0.15, 0.25, wz + Math.sin(angle) * 0.15),
        velocity: new Vector3(Math.cos(angle) * speed, 0.5 + Math.random() * 0.5, Math.sin(angle) * speed),
        color: PUFF_COLOR,
        start: now,
        size: 0.09 + Math.random() * 0.06,
        spin: Math.random() * 4,
      },
      MAX_PUFFS,
    );
  }
  for (let i = 0; i < DEBRIS_PER_HARVEST; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.6 + Math.random() * 1;
    pushCapped(
      rt.debris,
      {
        position: new Vector3(wx, 0.3, wz),
        velocity: new Vector3(Math.cos(angle) * speed, 2 + Math.random() * 1.6, Math.sin(angle) * speed),
        color: tint,
        start: now,
        size: 0.035 + Math.random() * 0.035,
        spin: 6 + Math.random() * 6,
      },
      MAX_DEBRIS,
    );
  }
}

const tmpMatrix = new Matrix4();
const tmpPosition = new Vector3();
const tmpQuaternion = new Quaternion();
const tmpEuler = new Euler();
const tmpScale = new Vector3();
const tmpColor = new Color();

function writePlantInstances(game: GameState, now: number, rt: Runtime, meshes: Partial<Record<EntityType, InstancedMesh | null>>): void {
  const counts = Object.fromEntries(ENTITY_TYPES.map((type) => [type, 0])) as Record<EntityType, number>;
  const { worldSize, cells, tick } = game;

  const place = (type: EntityType, cellIndex: number, progress: number, factor: number, lift: number) => {
    const mesh = meshes[type];
    if (!mesh) return;
    const [wx, wz] = cellToWorld(cellIndex % worldSize, Math.floor(cellIndex / worldSize), worldSize);
    const hash = cellHash(cellIndex);
    const swayAmount = type === 'Grass' ? 0.05 : 0.015;
    const sway = Math.sin(now * 1.6 + hash * 6.28) * swayAmount;
    // Grass patches only rotate by quarter turns so they still fill their square tile; sunflowers face the camera.
    const yaw =
      type === 'Grass' ? Math.floor(hash * 4) * (Math.PI / 2) : type === 'Sunflower' ? (hash - 0.5) * 0.5 : hash * Math.PI * 2;
    tmpEuler.set(sway, yaw, sway * 0.6);
    tmpQuaternion.setFromEuler(tmpEuler);
    tmpPosition.set(wx, lift, wz);
    growthScale(type, progress, tmpScale).multiplyScalar(Math.max(factor, 0.0001));
    const index = counts[type]++;
    mesh.setMatrixAt(index, tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale));
    mesh.setColorAt(index, tmpColor.copy(UNRIPE_TINTS[type]).lerp(WHITE, progress >= 1 ? 1 : progress * 0.75));
  };

  for (let i = 0; i < cells.length; i++) {
    const entity = cells[i]!.entity;
    if (!entity) continue;
    let factor = 1;
    const spawnTime = rt.spawnTimes.get(i);
    if (spawnTime !== undefined) {
      const t = (now - spawnTime) / SPAWN_DURATION;
      if (t >= 1) rt.spawnTimes.delete(i);
      else factor = Math.max(0, easeOutBack(t));
    }
    place(entity.type, i, getGrowthProgress(entity, tick), factor, 0);
  }

  rt.ghosts = rt.ghosts.filter((ghost) => now - ghost.start < GHOST_DURATION);
  for (const ghost of rt.ghosts) {
    const t = (now - ghost.start) / GHOST_DURATION;
    const pop = t < 0.25 ? 1 + t * 0.8 : 1.2 * (1 - (t - 0.25) / 0.75);
    place(ghost.type, ghost.cellIndex, ghost.progress, pop, t * 0.3);
  }

  for (const type of ENTITY_TYPES) {
    const mesh = meshes[type];
    if (!mesh) continue;
    mesh.count = counts[type];
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

function writeParticles(now: number, particles: Particle[], mesh: InstancedMesh | null, lifetime: number, gravity: number): void {
  if (!mesh) return;
  let count = 0;
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i]!;
    const age = now - particle.start;
    if (age >= lifetime) {
      particles.splice(i, 1);
      continue;
    }
    const life = age / lifetime;
    tmpPosition.copy(particle.position).addScaledVector(particle.velocity, age);
    tmpPosition.y -= 0.5 * gravity * age * age;
    tmpEuler.set(age * particle.spin, age * particle.spin * 0.7, 0);
    tmpQuaternion.setFromEuler(tmpEuler);
    // Puffs swell then shrink away; debris just shrinks.
    const size = gravity === 0 ? particle.size * (1 + life * 0.8) * (1 - life * life) : particle.size * (1 - life);
    tmpScale.setScalar(Math.max(size, 0.0001));
    mesh.setMatrixAt(count, tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale));
    mesh.setColorAt(count, particle.color);
    count++;
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
