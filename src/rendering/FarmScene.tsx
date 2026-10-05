import { MapControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
import { useStore } from 'zustand';
import type { GameLoop } from '../game/GameLoop.ts';
import type { GameStore } from '../game/gameStore.ts';
import { Drone } from './Drone.tsx';
import { Ground } from './Ground.tsx';
import { Plants } from './Plants.tsx';

const CAMERA_FOV = 32;
/** Camera elevation above the horizon: a steep view from the south, like the game's. */
const CAMERA_ELEVATION = (62 * Math.PI) / 180;
/** Fraction of the viewport height the field occupies when framed. */
const FIELD_SCREEN_FRACTION = 0.52;
const MIN_FIELD_EXTENT = 3;

/** Frames the field in the middle of the screen whenever the world size or viewport changes. */
function CameraRig({ worldSize }: { worldSize: number }) {
  const get = useThree((state) => state.get);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useLayoutEffect(() => {
    const { camera, controls } = get();
    const aspect = width / Math.max(1, height);
    const tanHalfFov = Math.tan((CAMERA_FOV * Math.PI) / 360);
    const extent = Math.max(worldSize, MIN_FIELD_EXTENT) + 1;
    const fitHeight = extent / FIELD_SCREEN_FRACTION / 2 / tanHalfFov;
    const fitWidth = extent / 0.6 / 2 / (tanHalfFov * aspect);
    const distance = Math.max(fitHeight, fitWidth);
    camera.position.set(0, Math.sin(CAMERA_ELEVATION) * distance, Math.cos(CAMERA_ELEVATION) * distance);
    camera.lookAt(0, 0, 0);
    const target = (controls as { target?: { set: (x: number, y: number, z: number) => void } } | null)?.target;
    target?.set(0, 0, 0);
  }, [get, worldSize, width, height]);

  return null;
}

export function FarmScene({ store, loop }: { store: GameStore; loop: GameLoop }) {
  const worldSize = useStore(store, (state) => state.game.worldSize);
  const cells = useStore(store, (state) => state.game.cells);
  const shadowExtent = worldSize / 2 + 3;

  return (
    <Canvas
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ fov: CAMERA_FOV, near: 0.1, far: 1000 }}
    >
      <CameraRig worldSize={worldSize} />
      <MapControls makeDefault enableRotate={false} screenSpacePanning={false} minDistance={3} maxDistance={400} enableDamping />
      <hemisphereLight args={['#dfe9f0', '#a07040', 1.6]} />
      <directionalLight
        position={[-8, 14, 4]}
        intensity={2.4}
        color="#ffdcae"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <Ground cells={cells} worldSize={worldSize} />
      <Plants loop={loop} worldSize={worldSize} />
      <Drone loop={loop} />
    </Canvas>
  );
}
