import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { CloseIcon, MinimizeIcon } from './icons.tsx';

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_WIDTH = 240;
const MIN_HEIGHT = 120;
const TITLE_BAR_HEIGHT = 38;
const STORAGE_PREFIX = 'thefarmproject.window.';

let topZIndex = 10;

interface StoredLayout {
  rect: WindowRect;
  minimized: boolean;
}

/** Window layout is a per-viewer convenience; storage may be unavailable, which is fine. */
function loadLayout(id: string, fallback: WindowRect): StoredLayout {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredLayout>;
      const rect = parsed.rect;
      if (rect && [rect.x, rect.y, rect.width, rect.height].every((v) => typeof v === 'number' && Number.isFinite(v))) {
        return { rect, minimized: parsed.minimized === true };
      }
    }
  } catch {
    // Ignore unreadable layout.
  }
  return { rect: fallback, minimized: false };
}

function saveLayout(id: string, layout: StoredLayout): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(layout));
  } catch {
    // Ignore: layout simply will not persist.
  }
}

/** Keeps at least part of the title bar reachable inside the viewport. */
function clampRect(rect: WindowRect): WindowRect {
  const width = Math.max(MIN_WIDTH, Math.min(rect.width, window.innerWidth));
  return {
    width,
    height: Math.max(MIN_HEIGHT, Math.min(rect.height, window.innerHeight)),
    x: Math.min(Math.max(rect.x, 100 - width), Math.max(0, window.innerWidth - 100)),
    y: Math.min(Math.max(rect.y, 0), Math.max(0, window.innerHeight - TITLE_BAR_HEIGHT)),
  };
}

interface FloatingWindowProps {
  id: string;
  title: ReactNode;
  initialRect: WindowRect;
  /** Buttons left of the title (run / step, or stop / pause while running). */
  leadingActions?: ReactNode;
  /** Extra buttons right of the title, before minimise / close. */
  trailingActions?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}

/** A draggable, resizable, minimisable window floating over the farm, styled like the in-game windows. */
export function FloatingWindow({ id, title, initialRect, leadingActions, trailingActions, onClose, children }: FloatingWindowProps) {
  const [layout, setLayout] = useState(() => {
    const stored = loadLayout(id, initialRect);
    return { ...stored, rect: clampRect(stored.rect) };
  });
  const [zIndex, setZIndex] = useState(() => ++topZIndex);
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; startRect: WindowRect } | null>(null);
  const { rect, minimized } = layout;

  const bringToFront = useCallback(() => {
    setZIndex((current) => (current === topZIndex ? current : ++topZIndex));
  }, []);

  const beginDrag = (mode: 'move' | 'resize', event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (mode === 'move' && (event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { mode, startX: event.clientX, startY: event.clientY, startRect: rect };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const start = drag.startRect;
    const next =
      drag.mode === 'move' ? { ...start, x: start.x + dx, y: start.y + dy } : { ...start, width: start.width + dx, height: start.height + dy };
    setLayout((current) => ({ ...current, rect: clampRect(next) }));
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    saveLayout(id, layout);
  };

  const toggleMinimized = () => {
    const next = { ...layout, minimized: !minimized };
    setLayout(next);
    saveLayout(id, next);
  };

  return (
    <div
      className="farm-window absolute flex flex-col"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: minimized ? TITLE_BAR_HEIGHT + 4 : rect.height, zIndex }}
      onPointerDownCapture={bringToFront}
    >
      <div
        className="farm-window-titlebar flex shrink-0 cursor-grab items-center gap-1.5 px-1.5 select-none active:cursor-grabbing"
        style={{ height: TITLE_BAR_HEIGHT }}
        onPointerDown={(event) => beginDrag('move', event)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {leadingActions}
        <div className="farm-window-title min-w-0 flex-1 truncate pl-1">{title}</div>
        {trailingActions}
        <WindowButton title={minimized ? 'Restore' : 'Minimise'} onClick={toggleMinimized}>
          <MinimizeIcon />
        </WindowButton>
        {onClose && (
          <WindowButton title="Close" onClick={onClose}>
            <CloseIcon />
          </WindowButton>
        )}
      </div>
      {!minimized && (
        <>
          <div className="farm-window-body min-h-0 flex-1">{children}</div>
          <div
            className="absolute right-0 bottom-0 h-4 w-4 cursor-se-resize"
            onPointerDown={(event) => beginDrag('resize', event)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-hidden
          />
        </>
      )}
    </div>
  );
}

export function WindowButton({
  title,
  onClick,
  children,
  tone = 'olive',
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  tone?: 'olive' | 'alert';
}) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className={`farm-square-button farm-square-button-${tone} h-7 w-7`}>
      {children}
    </button>
  );
}
