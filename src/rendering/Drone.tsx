import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MathUtils, MeshStandardMaterial, Vector3, type Group } from 'three';
import type { GameLoop } from '../game/GameLoop.ts';
import { cellToWorld } from './layout.ts';
import { createDroneBody, createRotor, createStrawHat, DRONE_ROTOR_DISTANCE } from './models.ts';

const HOVER_HEIGHT = 1.05;
const FOLLOW_LAMBDA = 14;
/** Moves longer than this (wrap-around at the field edge) teleport instead of gliding across the field. */
const SNAP_DISTANCE = 1.5;
const MAX_TILT = 0.35;
const FLIP_DURATION = 0.65;
const DIP_DURATION = 0.28;
const BUBBLE_DURATION_MS = 3000;
const BUBBLE_MAX_LENGTH = 120;
const ROTOR_POSITIONS: [number, number, number][] = [0, 1, 2, 3].map((i) => {
  const angle = Math.PI / 4 + (i * Math.PI) / 2;
  return [Math.cos(angle) * DRONE_ROTOR_DISTANCE, 0.05, Math.sin(angle) * DRONE_ROTOR_DISTANCE];
});

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** The farming drone: straw hat, spinning rotors, tilts into its movement, flips and dips on actions. */
export function Drone({ loop }: { loop: GameLoop }) {
  const rootRef = useRef<Group>(null);
  const tiltRef = useRef<Group>(null);
  const rotorRefs = useRef<(Group | null)[]>([]);
  const animation = useRef({ flipStart: -Infinity, dipStart: -Infinity, pendingFlip: false, pendingDip: false });
  const lastPosition = useRef(new Vector3());
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);

  const geometries = useMemo(() => ({ body: createDroneBody(), hat: createStrawHat(), rotor: createRotor() }), []);
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 }), []);

  useEffect(() => {
    let bubbleId = 0;
    return loop.subscribeEvents((event) => {
      if (event.type === 'print') {
        const text = event.text.length > BUBBLE_MAX_LENGTH ? `${event.text.slice(0, BUBBLE_MAX_LENGTH)}…` : event.text;
        setBubble({ id: ++bubbleId, text });
        return;
      }
      const kind = event.action.kind;
      if (kind === 'doAFlip') animation.current.pendingFlip = true;
      else if (kind === 'harvest' || kind === 'plant' || kind === 'till') animation.current.pendingDip = true;
    });
  }, [loop]);

  useEffect(() => {
    if (!bubble) return;
    const timer = setTimeout(() => setBubble((current) => (current?.id === bubble.id ? null : current)), BUBBLE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [bubble]);

  useFrame((state, delta) => {
    const root = rootRef.current;
    const tilt = tiltRef.current;
    if (!root || !tilt) return;
    const now = state.clock.elapsedTime;
    const anim = animation.current;
    if (anim.pendingFlip) {
      anim.flipStart = now;
      anim.pendingFlip = false;
    }
    if (anim.pendingDip) {
      anim.dipStart = now;
      anim.pendingDip = false;
    }

    const { drone, worldSize } = loop.getState();
    const [wx, wz] = cellToWorld(drone.pos.x, drone.pos.y, worldSize);
    lastPosition.current.copy(root.position);
    const dx = wx - root.position.x;
    const dz = wz - root.position.z;
    if (Math.hypot(dx, dz) > SNAP_DISTANCE) {
      root.position.x = wx;
      root.position.z = wz;
    } else {
      root.position.x = MathUtils.damp(root.position.x, wx, FOLLOW_LAMBDA, delta);
      root.position.z = MathUtils.damp(root.position.z, wz, FOLLOW_LAMBDA, delta);
    }

    // Lean into the direction of travel.
    const safeDelta = Math.max(delta, 1e-3);
    const vx = (root.position.x - lastPosition.current.x) / safeDelta;
    const vz = (root.position.z - lastPosition.current.z) / safeDelta;
    const targetPitch = MathUtils.clamp(vz * 0.12, -MAX_TILT, MAX_TILT);
    const targetRoll = MathUtils.clamp(-vx * 0.12, -MAX_TILT, MAX_TILT);
    tilt.rotation.z = MathUtils.damp(tilt.rotation.z, targetRoll, 10, delta);

    let height = HOVER_HEIGHT + Math.sin(now * 2.6) * 0.05;
    let pitch = MathUtils.damp(tilt.rotation.x % (Math.PI * 2), targetPitch, 10, delta);

    const flipT = (now - anim.flipStart) / FLIP_DURATION;
    if (flipT >= 0 && flipT < 1) {
      pitch = -Math.PI * 2 * easeInOut(flipT);
      height += Math.sin(Math.PI * flipT) * 0.55;
    }
    const dipT = (now - anim.dipStart) / DIP_DURATION;
    if (dipT >= 0 && dipT < 1) height -= Math.sin(Math.PI * dipT) * 0.28;

    tilt.rotation.x = pitch;
    root.position.y = height;

    const spin = delta * 30;
    for (const rotor of rotorRefs.current) if (rotor) rotor.rotation.y += spin;
  });

  return (
    <group ref={rootRef} position={[0, HOVER_HEIGHT, 0]}>
      <group ref={tiltRef}>
        <mesh geometry={geometries.body} material={material} castShadow />
        <mesh geometry={geometries.hat} material={material} position={[0, 0.03, 0]} castShadow />
        {ROTOR_POSITIONS.map((position, i) => (
          <group
            key={i}
            position={position}
            ref={(rotor) => {
              rotorRefs.current[i] = rotor;
            }}
          >
            <mesh geometry={geometries.rotor} material={material} />
          </group>
        ))}
      </group>
      {bubble && (
        <Html position={[0, 0.75, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div key={bubble.id} className="farm-speech-bubble">
            {bubble.text}
          </div>
        </Html>
      )}
    </group>
  );
}
