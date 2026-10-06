import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  Euler,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type PointLight,
} from 'three';
import { getGrowthProgress } from '../core/state/crops.ts';
import { countAdjacentMines, isMinefield, minePosOf, neighborOf } from '../core/state/mine.ts';
import type { GameState, MineState } from '../core/state/types.ts';
import type { GameLoop } from '../game/GameLoop.ts';
import type { GameStore } from '../game/gameStore.ts';
import { BLOCK_PARTICLE_COLORS, getBlockGeometry, MUSHROOM_PALETTE, SOLID_BLOCKS, type SolidBlock } from './blockModels.ts';
import { cellToWorld, LAYER_HEIGHT, layerFloor, layerTop } from './layout.ts';
import { getPlantGeometry } from './models.ts';
import { getDigitTextures } from './textures.ts';
import { fadeMaterial, getFocusDepth, layerOpacity } from './viewDepth.ts';

const MAX_DEBRIS = 360;
const DEBRIS_LIFETIME = 0.8;
const GRAVITY = 7;
const FLASH_DURATION = 0.5;

interface Particle {
  position: Vector3;
  velocity: Vector3;
  color: Color;
  start: number;
  size: number;
  spin: number;
}

const tmpMatrix = new Matrix4();
const tmpPosition = new Vector3();
const tmpQuaternion = new Quaternion();
const tmpEuler = new Euler();
const tmpScale = new Vector3();
const tmpColor = new Color();
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const MUSHROOM_COLORS = MUSHROOM_PALETTE.map((color) => new Color(color));
const UNRIPE_MUSHROOM = new Color('#cfc6b6');

/** Centre of a mine block in scene coordinates. */
function blockCenter(index: number, size: number, out: Vector3): Vector3 {
  const { pos, depth } = minePosOf(index, size);
  const [wx, wz] = cellToWorld(pos.x, pos.y, size);
  return out.set(wx, layerTop(depth) - LAYER_HEIGHT / 2, wz);
}

interface UndergroundProps {
  loop: GameLoop;
  store: GameStore;
  worldSize: number;
  layers: number;
}

/**
 * The mine below the farm, as a full cross-section: every layer is drawn as blocks, dug-out cells are
 * empty, mushrooms grow on the cave floors and minefield cells show their numbers. Layers above the
 * focused one fade out so the tunnels below stay visible. Breaking blocks throws chips, mines explode.
 */
export function Underground({ loop, store, worldSize, layers }: UndergroundProps) {
  const area = worldSize * worldSize;
  const blockRefs = useRef(new Map<string, InstancedMesh | null>());
  const mushroomRefs = useRef<(InstancedMesh | null)[]>([]);
  const digitRefs = useRef<(InstancedMesh | null)[]>([]);
  const debrisRef = useRef<InstancedMesh>(null);
  const flashRef = useRef<PointLight>(null);
  const runtime = useRef({
    lastMine: null as MineState | null,
    lastFocus: -1,
    opacities: [] as number[],
    debris: [] as Particle[],
    pendingBursts: [] as { center: Vector3; color: string; count: number; power: number }[],
    flash: { start: -Infinity, position: new Vector3() },
    pendingFlash: null as Vector3 | null,
  });

  const layerMaterials = useMemo(
    () =>
      Array.from(
        { length: layers },
        () => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, transparent: false }),
      ),
    [layers],
  );
  const digitMaterials = useMemo(
    () => getDigitTextures().map((map) => new MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false })),
    [],
  );
  const shared = useMemo(
    () => ({
      digitGeometry: new PlaneGeometry(0.56, 0.56),
      debrisGeometry: new BoxGeometry(1, 1, 1),
      debrisMaterial: new MeshStandardMaterial({ roughness: 0.8, flatShading: true }),
      debrisColors: new Float32Array(MAX_DEBRIS * 3),
      mushroomColors: Array.from({ length: layers }, () => new Float32Array(area * 3)),
    }),
    [layers, area],
  );

  useEffect(() => {
    runtime.current.lastMine = null;
    runtime.current.opacities = Array.from({ length: layers }, () => 1);
  }, [layers, worldSize]);

  useEffect(
    () =>
      loop.subscribeEvents((event) => {
        if (event.type !== 'action') return;
        const { before, after, action } = event;
        const rt = runtime.current;
        const size = before.worldSize;
        if (!before.mine) return;
        if (action.kind === 'dig' || action.kind === 'defuse') {
          const target = neighborOf(before.drone.pos, before.drone.depth, action.direction, size, before.mine.layers);
          if (!target || target.depth === 0) return;
          const index = (target.depth - 1) * size * size + target.pos.y * size + target.pos.x;
          const cell = before.mine.cells[index]!;
          const center = blockCenter(index, size, new Vector3());
          if (event.event === 'explosion') {
            rt.pendingBursts.push({ center, color: '#f6b23c', count: 40, power: 3 }, { center, color: '#3a3330', count: 30, power: 2.2 });
            rt.pendingFlash = center;
          } else if (after.mine?.cells[index] !== cell) {
            const broke = after.mine?.cells[index]?.block === 'Air';
            rt.pendingBursts.push({ center, color: BLOCK_PARTICLE_COLORS[cell.block], count: broke ? 14 : 5, power: broke ? 1.3 : 0.8 });
          }
        }
        if (event.event === 'ruinFound' || event.event === 'blast') {
          const [wx, wz] = cellToWorld(before.drone.pos.x, before.drone.pos.y, size);
          const center = new Vector3(wx, layerFloor(Math.max(1, before.drone.depth)) + 0.5, wz);
          if (event.event === 'blast') {
            rt.pendingBursts.push({ center, color: '#7a756e', count: 50, power: 2.6 });
            rt.pendingFlash = center;
          } else {
            rt.pendingBursts.push({ center, color: '#ffd34a', count: 36, power: 1.8 });
          }
        }
      }),
    [loop],
  );

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;
    const game: GameState = loop.getState();
    const mine = game.mine;
    const rt = runtime.current;
    if (!mine || game.worldSize !== worldSize || mine.layers !== layers) return;
    const focus = getFocusDepth(store, loop);

    for (let depth = 1; depth <= layers; depth++) {
      rt.opacities[depth - 1] = fadeMaterial(layerMaterials[depth - 1]!, rt.opacities[depth - 1] ?? 1, layerOpacity(depth, focus), delta);
    }

    if (rt.lastMine !== mine || rt.lastFocus !== focus) {
      writeBlocks(mine, worldSize, layers, blockRefs.current);
      writeDigits(mine, worldSize, layers, focus, digitRefs.current);
      rt.lastMine = mine;
      rt.lastFocus = focus;
    }
    writeMushrooms(game, mine, now, mushroomRefs.current);

    for (const burst of rt.pendingBursts.splice(0)) spawnBurst(rt.debris, burst, now);
    if (rt.pendingFlash) {
      rt.flash.start = now;
      rt.flash.position.copy(rt.pendingFlash);
      rt.pendingFlash = null;
    }
    const flash = flashRef.current;
    if (flash) {
      const t = (now - rt.flash.start) / FLASH_DURATION;
      flash.intensity = t >= 0 && t < 1 ? 40 * (1 - t) ** 2 : 0;
      flash.position.copy(rt.flash.position);
    }
    writeDebris(now, rt.debris, debrisRef.current);
  });

  return (
    <group>
      {layerMaterials.map((material, i) => {
        const depth = i + 1;
        return (
          <group key={depth}>
            {SOLID_BLOCKS.map((block) => (
              <instancedMesh
                key={`${block}-${area}`}
                ref={(mesh) => {
                  blockRefs.current.set(`${depth}-${block}`, mesh);
                }}
                args={[getBlockGeometry(block), material, area]}
                frustumCulled={false}
              />
            ))}
            <instancedMesh
              key={`mushroom-${area}`}
              ref={(mesh) => {
                mushroomRefs.current[i] = mesh;
              }}
              args={[getPlantGeometry('Mushroom'), material, area]}
              frustumCulled={false}
            >
              <instancedBufferAttribute attach="instanceColor" args={[shared.mushroomColors[i]!, 3]} />
            </instancedMesh>
          </group>
        );
      })}
      {digitMaterials.map((material, digit) =>
        digit === 0 ? null : (
          <instancedMesh
            key={`digit-${digit}-${area * layers}`}
            ref={(mesh) => {
              digitRefs.current[digit] = mesh;
            }}
            args={[shared.digitGeometry, material, area * layers]}
            frustumCulled={false}
            renderOrder={2}
          />
        ),
      )}
      <instancedMesh ref={debrisRef} args={[shared.debrisGeometry, shared.debrisMaterial, MAX_DEBRIS]} frustumCulled={false}>
        <instancedBufferAttribute attach="instanceColor" args={[shared.debrisColors, 3]} />
      </instancedMesh>
      <pointLight ref={flashRef} color="#ffb347" intensity={0} distance={8} decay={1.5} />
    </group>
  );
}

function writeBlocks(mine: MineState, size: number, layers: number, meshes: Map<string, InstancedMesh | null>): void {
  const area = size * size;
  for (let depth = 1; depth <= layers; depth++) {
    const counts = Object.fromEntries(SOLID_BLOCKS.map((block) => [block, 0])) as Record<SolidBlock, number>;
    for (let i = (depth - 1) * area; i < depth * area; i++) {
      const cell = mine.cells[i]!;
      if (cell.block === 'Air') continue;
      const mesh = meshes.get(`${depth}-${cell.block}`);
      if (!mesh) continue;
      blockCenter(i, size, tmpPosition);
      // Damaged blocks shrink a little and turn, showing the drill's progress.
      const wear = cell.damage * 0.06;
      tmpQuaternion.setFromEuler(tmpEuler.set(0, cell.damage * 0.08, 0));
      tmpScale.setScalar(1 - wear);
      mesh.setMatrixAt(counts[cell.block]++, tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale));
    }
    for (const block of SOLID_BLOCKS) {
      const mesh = meshes.get(`${depth}-${block}`);
      if (!mesh) continue;
      mesh.count = counts[block];
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

function writeMushrooms(game: GameState, mine: MineState, now: number, meshes: (InstancedMesh | null)[]): void {
  const size = game.worldSize;
  const area = size * size;
  meshes.forEach((mesh, layerIndex) => {
    if (!mesh) return;
    let count = 0;
    for (let i = layerIndex * area; i < (layerIndex + 1) * area; i++) {
      const entity = mine.cells[i]!.entity;
      if (!entity) continue;
      const { pos, depth } = minePosOf(i, size);
      const [wx, wz] = cellToWorld(pos.x, pos.y, size);
      const progress = getGrowthProgress(entity, game.tick);
      const hash = Math.sin(i * 12.9898) * 43758.5453;
      tmpPosition.set(wx, layerFloor(depth), wz);
      tmpQuaternion.setFromEuler(tmpEuler.set(Math.sin(now * 1.3 + hash) * 0.03, (hash - Math.floor(hash)) * Math.PI * 2, 0));
      tmpScale.setScalar(Math.max(0.0001, 0.25 + 0.75 * (1 - (1 - progress) ** 3)) * 1.6);
      mesh.setMatrixAt(count, tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale));
      const ripe = MUSHROOM_COLORS[entity.color ?? 0] ?? MUSHROOM_COLORS[0]!;
      mesh.setColorAt(count, tmpColor.copy(UNRIPE_MUSHROOM).lerp(ripe, progress >= 1 ? 1 : progress * 0.7));
      count++;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
}

/** Numbers on the dug-out cells of minefield layers, at and below the focused layer. */
function writeDigits(mine: MineState, size: number, layers: number, focus: number, meshes: (InstancedMesh | null)[]): void {
  const counts = new Array<number>(9).fill(0);
  const area = size * size;
  for (let depth = Math.max(1, focus); depth <= layers; depth++) {
    if (!isMinefield(depth)) continue;
    for (let i = (depth - 1) * area; i < depth * area; i++) {
      const cell = mine.cells[i]!;
      if (cell.block !== 'Air' || cell.entity) continue;
      const { pos } = minePosOf(i, size);
      const digit = countAdjacentMines(mine, pos, depth, size);
      const mesh = meshes[digit];
      if (digit === 0 || !mesh) continue;
      const [wx, wz] = cellToWorld(pos.x, pos.y, size);
      tmpPosition.set(wx, layerFloor(depth) + 0.02, wz);
      tmpScale.setScalar(1);
      mesh.setMatrixAt(counts[digit]!++, tmpMatrix.compose(tmpPosition, FLAT, tmpScale));
    }
  }
  meshes.forEach((mesh, digit) => {
    if (!mesh) return;
    mesh.count = counts[digit] ?? 0;
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function spawnBurst(debris: Particle[], burst: { center: Vector3; color: string; count: number; power: number }, now: number): void {
  const color = new Color(burst.color);
  for (let i = 0; i < burst.count; i++) {
    if (debris.length >= MAX_DEBRIS) debris.shift();
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.4 + Math.random()) * burst.power;
    debris.push({
      position: burst.center.clone().add(new Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.5, (Math.random() - 0.5) * 0.5)),
      velocity: new Vector3(Math.cos(angle) * speed, (1 + Math.random() * 1.5) * burst.power, Math.sin(angle) * speed),
      color,
      start: now,
      size: 0.04 + Math.random() * 0.06,
      spin: 5 + Math.random() * 8,
    });
  }
}

function writeDebris(now: number, debris: Particle[], mesh: InstancedMesh | null): void {
  if (!mesh) return;
  let count = 0;
  for (let i = debris.length - 1; i >= 0; i--) {
    const particle = debris[i]!;
    const age = now - particle.start;
    if (age >= DEBRIS_LIFETIME) {
      debris.splice(i, 1);
      continue;
    }
    tmpPosition.copy(particle.position).addScaledVector(particle.velocity, age);
    tmpPosition.y -= 0.5 * GRAVITY * age * age;
    tmpQuaternion.setFromEuler(tmpEuler.set(age * particle.spin, age * particle.spin * 0.7, 0));
    tmpScale.setScalar(Math.max(0.0001, particle.size * (1 - age / DEBRIS_LIFETIME)));
    mesh.setMatrixAt(count, tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale));
    mesh.setColorAt(count, particle.color);
    count++;
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
