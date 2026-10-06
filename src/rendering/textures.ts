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

/** Clay tile top: smooth reddish-brown, slightly glossy patches and a few dry cracks. */
function drawClay(ctx: CanvasRenderingContext2D, random: () => number): void {
  const size = TEXTURE_SIZE;
  ctx.fillStyle = '#b0684a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(150, 80, 55, 0.25)' : 'rgba(205, 140, 105, 0.22)';
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 10 + random() * 30, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(95, 48, 30, 0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    let x = random() * size;
    let y = random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (random() - 0.5) * 60;
      y += (random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** Shaft tile top: a dark square hole framed by wooden planks, with a ladder going down. */
function drawShaft(ctx: CanvasRenderingContext2D, random: () => number): void {
  const size = TEXTURE_SIZE;
  const rim = 34;
  ctx.fillStyle = '#7a5530';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#8d6338' : '#6c4a28';
    ctx.fillRect(0, (i * size) / 4, size, 3);
  }
  const hole = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  hole.addColorStop(0, '#0b0806');
  hole.addColorStop(1, '#2a1b10');
  ctx.fillStyle = hole;
  ctx.fillRect(rim, rim, size - rim * 2, size - rim * 2);
  ctx.fillStyle = '#9b7444';
  ctx.fillRect(size / 2 - 40, rim, 8, size - rim * 2);
  ctx.fillRect(size / 2 + 32, rim, 8, size - rim * 2);
  for (let y = rim + 16; y < size - rim; y += 30) ctx.fillRect(size / 2 - 40, y, 80, 6);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(40, 25, 12, ${0.2 + random() * 0.3})`;
    ctx.fillRect(random() * size, random() * size, 2, 2);
  }
}

export interface GroundTextures {
  grassland: Texture;
  soil: Texture;
  clay: Texture;
  shaft: Texture;
}

let cache: GroundTextures | null = null;

export function getGroundTextures(): GroundTextures {
  cache ??= {
    grassland: createCanvasTexture(drawGrassland, 11),
    soil: createCanvasTexture(drawSoil, 23),
    clay: createCanvasTexture(drawClay, 37),
    shaft: createCanvasTexture(drawShaft, 41),
  };
  return cache;
}

/** Minesweeper digits, coloured like the classic game. */
const DIGIT_COLORS = ['', '#2f6fe0', '#2e8a2e', '#d33a2c', '#1d2f8a', '#8a2a1d', '#1d8a8a', '#222222', '#777777'];

let digitCache: Texture[] | null = null;

/** Textures for the numbers 1–8 shown on dug-out minefield cells (index = number). */
export function getDigitTextures(): Texture[] {
  digitCache ??= DIGIT_COLORS.map((color, digit) =>
    createCanvasTexture((ctx) => {
      const size = TEXTURE_SIZE;
      ctx.clearRect(0, 0, size, size);
      if (digit === 0) return;
      ctx.fillStyle = 'rgba(235, 225, 205, 0.85)';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = `bold ${size * 0.55}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(digit), size / 2, size / 2 + size * 0.03);
    }, digit),
  );
  return digitCache;
}
