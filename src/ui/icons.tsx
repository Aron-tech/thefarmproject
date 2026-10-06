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
