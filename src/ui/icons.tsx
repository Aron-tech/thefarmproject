import type { ReactNode } from 'react';
import type { ItemType } from '../core/state/types.ts';

/** Item icons drawn as small isometric, low-poly-style objects, echoing the game's rendered icons. */

function HayIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M6 20 24 12l18 8v14l-18 8-18-8z" fill="#c98a24" />
      <path d="M6 20 24 28l18-8-18-8z" fill="#f2c24e" />
      <path d="M24 28v14l18-8V20z" fill="#d99a2c" />
      <path d="M6 20v14l18 8V28z" fill="#e8ae3a" />
      <path d="M10 22.5 26 15M16 25 32 17.5M22 27.5 38 20" stroke="#c48a1e" strokeWidth="1.2" />
      <path d="M13 24v13.5M19 26.5V40" stroke="#9a4f22" strokeWidth="2" />
      <path d="M8 26l14 6.5M8 30l14 6.5M27 30l12-5.5M27 34l12-5.5" stroke="#c48a1e" strokeWidth="0.9" opacity="0.8" />
    </svg>
  );
}

function WoodIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M8 26 30 14l8 6-22 12z" fill="#7a3f1f" />
      <path d="M16 32 38 20v5L16 37z" fill="#5e2e15" />
      <ellipse cx="12" cy="32.5" rx="5.2" ry="5.6" fill="#d8955a" stroke="#6b3518" strokeWidth="1.4" />
      <ellipse cx="12" cy="32.5" rx="2.4" ry="2.7" fill="none" stroke="#a8622e" strokeWidth="1" />
      <path d="M14 19 32 9l7 5-18 10z" fill="#8a4a24" />
      <ellipse cx="17.5" cy="21.5" rx="4.6" ry="5" fill="#e0a066" stroke="#6b3518" strokeWidth="1.3" />
      <ellipse cx="17.5" cy="21.5" rx="2" ry="2.3" fill="none" stroke="#a8622e" strokeWidth="1" />
    </svg>
  );
}

function CarrotIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M27 17 9 40c-1 1.3.6 2.6 1.8 1.6L32 22z" fill="#e8792a" />
      <path d="M27 17 9 40l11-10z" fill="#f59a45" />
      <path d="M16 31l3 1.5M20 26l2.6 1.4" stroke="#b5521a" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M28 18l2-12 3 11z" fill="#4d8a24" />
      <path d="M30 20l12-6-9 9z" fill="#5f9e2e" />
      <path d="M29 19l9-10-4 11z" fill="#6aae36" />
    </svg>
  );
}

function PowerIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M28 4 10 27h11l-4 17 21-25H26z" fill="#f5c518" stroke="#b88a0a" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M28 4 10 27h11l3-4H17z" fill="#ffe066" />
    </svg>
  );
}

/** An isometric block: top, left and right faces in three shades. */
function IsoBlock({ top, left, right, children }: { top: string; left: string; right: string; children?: ReactNode }) {
  return (
    <>
      <path d="M8 18 24 10l16 8-16 8z" fill={top} />
      <path d="M8 18v16l16 8V26z" fill={left} />
      <path d="M24 26v16l16-8V18z" fill={right} />
      {children}
    </>
  );
}

function StoneIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <IsoBlock top="#b3b0aa" left="#8d8a84" right="#73706b">
        <path d="M14 18l5-2 4 2-5 2zM26 15l4-1.5 3 1.5-4 2z" fill="#9a9791" />
        <path d="M12 26l4 2v4l-4-2zM30 32l5-2.5v3.5l-5 2.5z" fill="#64615c" />
      </IsoBlock>
    </svg>
  );
}

function ClayIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <IsoBlock top="#c98163" left="#a8613f" right="#8e4b31">
        <path d="M8 26l16 8 16-8M8 30l16 8 16-8" stroke="#c27a55" strokeWidth="1.4" fill="none" />
      </IsoBlock>
    </svg>
  );
}

function CoalIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M8 30l7-10 9 2 4 9-8 7-10-2z" fill="#2c2927" />
      <path d="M8 30l7-10 9 2-6 5z" fill="#4a4542" />
      <path d="M24 26l9-9 8 4 1 10-8 5-6-3z" fill="#1d1b1a" />
      <path d="M24 26l9-9 8 4-7 5z" fill="#3c3835" />
      <path d="M17 36l6-3 4 4-4 5-6-1z" fill="#252220" />
    </svg>
  );
}

function IronIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M6 28l18-9 18 9-18 9z" fill="#c9c6c0" />
      <path d="M10 26l14-7 14 7-14 7z" fill="#e1ded8" />
      <path d="M6 28v5l18 9v-5z" fill="#9b978f" />
      <path d="M24 37v5l18-9v-5z" fill="#7d7a73" />
      <path d="M13 26l11-5.5" stroke="#c0703a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function QuartzIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M20 42l-6-6 3-22 6-8 6 8 2 22-5 6z" fill="#e6d9f7" />
      <path d="M23 6l6 8 2 22-5 6-3-1z" fill="#c9b8e6" />
      <path d="M23 6l-6 8 6 2 6-2z" fill="#ffffff" />
      <path d="M31 40l-4-3 3-12 4-4 4 5-1 11z" fill="#fbe9f0" />
      <path d="M34 21l4 5-1 11-3 3z" fill="#e3c6d4" />
    </svg>
  );
}

function GoldIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M6 30l18-9 18 9-18 9z" fill="#f4c430" />
      <path d="M11 28l13-6.5L37 28l-13 6.5z" fill="#ffe27a" />
      <path d="M6 30v5l18 9v-5z" fill="#d49b12" />
      <path d="M24 39v5l18-9v-5z" fill="#b8820a" />
      <path d="M15 27l6-3" stroke="#fff6c8" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MushroomIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M19 26h10l2 15c0 2-14 2-14 0z" fill="#ece3d2" />
      <path d="M24 26h5l2 15c0 1-3 1.5-7 1.5z" fill="#d1c6b2" />
      <path d="M6 27c0-11 8-19 18-19s18 8 18 19c-5 2-31 2-36 0z" fill="#d8352f" />
      <path d="M6 27c0-11 8-19 18-19-6 3-11 10-11 20-3 0-5-.4-7-1z" fill="#ee5a4c" />
      <circle cx="17" cy="17" r="2.6" fill="#fff8ea" />
      <circle cx="27" cy="13" r="2.2" fill="#fff8ea" />
      <circle cx="33" cy="21" r="2.4" fill="#fff8ea" />
      <circle cx="24" cy="22" r="1.8" fill="#fff8ea" />
    </svg>
  );
}

function DynamiteIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${i * 7} ${i % 2 === 0 ? 0 : -3})`}>
          <rect x="11" y="18" width="7" height="22" rx="2" fill="#d6372b" />
          <rect x="11" y="18" width="3" height="22" rx="1.5" fill="#ee5a4c" />
        </g>
      ))}
      <rect x="10" y="27" width="23" height="4" fill="#7a5530" />
      <path d="M21 15c1-5 4-7 8-8" stroke="#3a2a1c" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M29 7l2-3 1 3 3-1-2 3 3 2-4 0z" fill="#f6b23c" />
    </svg>
  );
}

function RiceIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M10 26c0-4 6-6 14-6s14 2 14 6l-3 14c-1 3-21 3-22 0z" fill="#c9a26a" />
      <path d="M24 20c8 0 14 2 14 6l-3 14c-.5 1.5-5 2.3-11 2.3z" fill="#b08a54" />
      <ellipse cx="24" cy="25" rx="13" ry="4.5" fill="#8a6a3c" />
      <path d="M13 24c2-4 6-5 11-5s9 1 11 5c-3 2-19 2-22 0z" fill="#f7f1e1" />
      <path d="M17 22l2-.5M22 20.5l2 .2M27 21.5l2-.4M20 23.5l2 .1M26 23.5l2-.3" stroke="#e0d6bd" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function ItemIcon({ item, className = 'h-10 w-10' }: { item: ItemType; className?: string }) {
  switch (item) {
    case 'Hay':
      return <HayIcon className={className} />;
    case 'Wood':
      return <WoodIcon className={className} />;
    case 'Carrot':
      return <CarrotIcon className={className} />;
    case 'Power':
      return <PowerIcon className={className} />;
    case 'Rice':
      return <RiceIcon className={className} />;
    case 'Stone':
      return <StoneIcon className={className} />;
    case 'Clay':
      return <ClayIcon className={className} />;
    case 'Coal':
      return <CoalIcon className={className} />;
    case 'Iron':
      return <IronIcon className={className} />;
    case 'Quartz':
      return <QuartzIcon className={className} />;
    case 'Gold':
      return <GoldIcon className={className} />;
    case 'Mushroom':
      return <MushroomIcon className={className} />;
    case 'Dynamite':
      return <DynamiteIcon className={className} />;
  }
}

// ---------------------------------------------------------------- window / toolbar glyphs

export function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
    </svg>
  );
}

/** Outlined play arrow: the game's "step" button. */
export function StepIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <path d="M4.5 3.2v9.6L12.4 8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <rect x="3.5" y="2.5" width="3" height="11" fill="currentColor" />
      <rect x="9.5" y="2.5" width="3" height="11" fill="currentColor" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <rect x="3.5" y="3.5" width="9" height="9" fill="currentColor" />
    </svg>
  );
}

export function MinimizeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <rect x="2.5" y="7" width="11" height="2.4" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="3.2" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <rect x="8.5" y="3" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Folder: opens the list of code files and folders. */
export function FilesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <path d="M3 6.5V19h18V8.5h-9.2L9.8 6.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Open book: opens the guide. */
export function GuideIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <path
        d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5zM12 6.5v13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>
      <path d="M5.5 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Cog: opens the main (Esc) menu with saving and settings. */
export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <path
        d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"
        fill="currentColor"
      />
      <circle cx="12" cy="12" r="3.4" fill="var(--farm-olive)" />
    </svg>
  );
}
