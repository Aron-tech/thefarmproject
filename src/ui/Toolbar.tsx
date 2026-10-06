import type { ReactNode } from 'react';
import { FilesIcon, GearIcon, GuideIcon, MenuIcon, PlusIcon } from './icons.tsx';

interface ToolbarProps {
  onNewFile: () => void;
  onToggleFiles: () => void;
  onToggleGuide: () => void;
  onOpenUnlocks: () => void;
  onOpenMenu: () => void;
}

function ToolbarButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="farm-square-button farm-square-button-olive farm-toolbar-button" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  );
}

/** Top-right square buttons, like the game's: new code file, files, guide, the unlock tree and the main menu. */
export function Toolbar({ onNewFile, onToggleFiles, onToggleGuide, onOpenUnlocks, onOpenMenu }: ToolbarProps) {
  return (
    <div className="absolute top-3 right-3 z-[30] flex gap-2">
      <ToolbarButton title="New code window" onClick={onNewFile}>
        <PlusIcon />
      </ToolbarButton>
      <ToolbarButton title="Files" onClick={onToggleFiles}>
        <FilesIcon />
      </ToolbarButton>
      <ToolbarButton title="Guide" onClick={onToggleGuide}>
        <GuideIcon />
      </ToolbarButton>
      <ToolbarButton title="Unlocks" onClick={onOpenUnlocks}>
        <MenuIcon />
      </ToolbarButton>
      <ToolbarButton title="Menu (Esc)" onClick={onOpenMenu}>
        <GearIcon />
      </ToolbarButton>
    </div>
  );
}
