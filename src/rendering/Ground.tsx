import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  DodecahedronGeometry,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type Material,
} from 'three';
import type { Cell, GroundType } from '../core/state/types.ts';
import { cellToWorld, SLAB_DEPTH, TILE_GAP, TILE_HEIGHT } from './layout.ts';
import { getGroundTextures } from './textures.ts';

const SLAB_SIDE_COLOR = '#e09445';
const SLAB_TOP_COLOR = '#9a5524';
const TILE_SIDE_COLORS: Record<GroundType, string> = { Grassland: '#55691c', Soil: '#7a3a1a' };
const ROCKS_PER_TILE = 2;

/** Box face order is +x, -x, +y, -y, +z, -z. */
function boxMaterials(top: Material, side: Material, bottom: Material = side): Material[] {
  return [side, side, top, bottom, side, side];
}

function TileLayer({ cells, worldSize, ground }: { cells: readonly Cell[]; worldSize: number; ground: GroundType }) {
  const meshRef = useRef<InstancedMesh>(null);
  const capacity = worldSize * worldSize;
  const geometry = useMemo(() => new BoxGeometry(1 - TILE_GAP, TILE_HEIGHT, 1 - TILE_GAP), []);
  const materials = useMemo(() => {
    const textures = getGroundTextures();
    const top = new MeshStandardMaterial({ map: ground === 'Soil' ? textures.soil : textures.grassland, roughness: 0.95 });
    const side = new MeshStandardMaterial({ color: TILE_SIDE_COLORS[ground], roughness: 1 });
    return boxMaterials(top, side);
  }, [ground]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    let count = 0;
    cells.forEach((cell, i) => {
      if (cell.ground !== ground) return;
      const [wx, wz] = cellToWorld(i % worldSize, Math.floor(i / worldSize), worldSize);
      mesh.setMatrixAt(count++, matrix.makeTranslation(wx, -TILE_HEIGHT / 2, wz));
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells, worldSize, ground]);

  return <instancedMesh key={capacity} ref={meshRef} args={[geometry, materials, capacity]} receiveShadow castShadow />;
}

/** Low-poly rocks studding the bottom rim of the slab, as on the in-game farm block. */
function SlabRocks({ worldSize }: { worldSize: number }) {
  const meshRef = useRef<InstancedMesh>(null);
  const count = worldSize * 4 * ROCKS_PER_TILE;
  const geometry = useMemo(() => new DodecahedronGeometry(0.1, 0), []);
  const material = useMemo(() => new MeshStandardMaterial({ color: '#a8977c', roughness: 1, flatShading: true }), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const half = worldSize / 2;
    const y = -TILE_HEIGHT - SLAB_DEPTH + 0.06;
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    let index = 0;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < worldSize * ROCKS_PER_TILE; i++) {
        const along = -half + (i + 0.5) / ROCKS_PER_TILE;
        const big = i % 2 === 0;
        const position =
          side === 0
            ? new Vector3(along, y, half)
            : side === 1
              ? new Vector3(half, y, -along)
              : side === 2
                ? new Vector3(-along, y, -half)
                : new Vector3(-half, y, along);
        quaternion.setFromEuler(new Euler(i * 1.3, i * 0.7 + side, i * 0.4));
        scale.set(big ? 1.3 : 0.8, big ? 0.65 : 0.45, big ? 1.1 : 0.8);
        mesh.setMatrixAt(index++, matrix.compose(position, quaternion, scale));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [worldSize]);

  return <instancedMesh key={count} ref={meshRef} args={[geometry, material, count]} castShadow />;
}

/** The farm: a floating slab with ochre sides, topped with grassland / soil tiles. */
export function Ground({ cells, worldSize }: { cells: readonly Cell[]; worldSize: number }) {
  const slabMaterials = useMemo(() => {
    const side = new MeshStandardMaterial({ color: SLAB_SIDE_COLOR, roughness: 0.9 });
    const top = new MeshStandardMaterial({ color: SLAB_TOP_COLOR, roughness: 1 });
    return boxMaterials(top, side);
  }, []);

  return (
    <group>
      <TileLayer cells={cells} worldSize={worldSize} ground="Grassland" />
      <TileLayer cells={cells} worldSize={worldSize} ground="Soil" />
      <mesh position={[0, -TILE_HEIGHT - SLAB_DEPTH / 2 + 0.02, 0]} material={slabMaterials} receiveShadow castShadow>
        <boxGeometry args={[worldSize, SLAB_DEPTH, worldSize]} />
      </mesh>
      <SlabRocks worldSize={worldSize} />
    </group>
  );
}
