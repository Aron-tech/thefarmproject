import { Canvas } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';

const PLACEHOLDER_GRID_SIZE = 3;
const TILE_GAP = 0.05;

/** Placeholder isometric scene; real grid rendering arrives in M1. */
export function FarmScene() {
  const tiles: { x: number; z: number }[] = [];
  for (let x = 0; x < PLACEHOLDER_GRID_SIZE; x++) {
    for (let z = 0; z < PLACEHOLDER_GRID_SIZE; z++) {
      tiles.push({ x, z });
    }
  }
  const offset = (PLACEHOLDER_GRID_SIZE - 1) / 2;

  return (
    <Canvas>
      <OrthographicCamera makeDefault position={[10, 10, 10]} zoom={60} onUpdate={(camera) => camera.lookAt(0, 0, 0)} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 3]} intensity={1.2} />
      {tiles.map(({ x, z }) => (
        <mesh key={`${x}-${z}`} position={[x - offset, 0, z - offset]}>
          <boxGeometry args={[1 - TILE_GAP, 0.2, 1 - TILE_GAP]} />
          <meshStandardMaterial color="#6b8e23" />
        </mesh>
      ))}
    </Canvas>
  );
}
