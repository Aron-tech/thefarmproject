import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import { nextRandom } from '../core/state/random.ts';

const TEXTURE_SIZE = 256;

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    const [value, next] = nextRandom(state);
    state = next;
    return value;
  };
}

function createCanvasTexture(draw: (ctx: CanvasRenderingContext2D, random: () => number) => void, seed: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  draw(ctx, createRandom(seed));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Grassland tile top: flat olive green with very soft mottling (the game's tiles are almost plain). */
function drawGrassland(ctx: CanvasRenderingContext2D, random: () => number): void {
  const size = TEXTURE_SIZE;
  ctx.fillStyle = '#6f8a24';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const radius = 8 + random() * 26;
    ctx.fillStyle = random() < 0.5 ? 'rgba(92, 118, 26, 0.18)' : 'rgba(132, 158, 52, 0.16)';
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  // Slightly darker rim so neighbouring tiles read as separate squares.
  const rim = ctx.createLinearGradient(0, 0, 0, size);
  rim.addColorStop(0, 'rgba(255, 255, 230, 0.08)');
  rim.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, size, size);
}

/** Tilled soil tile top: terracotta with raised ridges running east–west, lit from the north-west. */
function drawSoil(ctx: CanvasRenderingContext2D, random: () => number): void {
  const size = TEXTURE_SIZE;
  ctx.fillStyle = '#a4552a';
  ctx.fillRect(0, 0, size, size);
  const ridges = 4;
  const spacing = size / ridges;
  for (let i = 0; i < ridges; i++) {
    const top = i * spacing;
    const ridge = ctx.createLinearGradient(0, top, 0, top + spacing);
    ridge.addColorStop(0, '#7c3d1d');
    ridge.addColorStop(0.12, '#c06a35');
    ridge.addColorStop(0.45, '#b45f2f');
    ridge.addColorStop(0.8, '#94491f');
    ridge.addColorStop(1, '#6e3418');
    ctx.fillStyle = ridge;
    ctx.fillRect(0, top, size, spacing);
  }
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(70, 30, 12, 0.35)' : 'rgba(210, 130, 80, 0.3)';
    const s = 1 + random() * 2.5;
    ctx.fillRect(random() * size, random() * size, s, s);
  }
}

let cache: { grassland: Texture; soil: Texture } | null = null;

export function getGroundTextures(): { grassland: Texture; soil: Texture } {
  cache ??= {
    grassland: createCanvasTexture(drawGrassland, 11),
    soil: createCanvasTexture(drawSoil, 23),
  };
  return cache;
}
