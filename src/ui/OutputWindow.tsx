import { useLayoutEffect, useRef, useState } from 'react';
import type { ConsoleEntry } from '../game/gameStore.ts';
import { FloatingWindow, WindowButton } from './FloatingWindow.tsx';
import { useGame, useGameState } from './gameContext.ts';

type Tab = 'output' | 'variables';

const ENTRY_STYLES: Record<ConsoleEntry['kind'], string> = {
  print: 'text-stone-100',
  error: 'text-rose-400',
  info: 'text-sky-300 italic',
};

function OutputView() {
  const entries = useGameState((s) => s.console);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed">
      {entries.length === 0 && <div className="text-stone-500">print() output appears here.</div>}
      {entries.map((entry) => (
        <div key={entry.id} className={`whitespace-pre-wrap ${ENTRY_STYLES[entry.kind]}`}>
          {entry.text}
        </div>
      ))}
    </div>
  );
}

function VariableTable({ title, variables }: { title: string; variables: Record<string, string> }) {
  const names = Object.keys(variables);
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold tracking-wide text-stone-400 uppercase">{title}</div>
      {names.length === 0 ? (
        <div className="text-stone-500">none</div>
      ) : (
        <table className="w-full">
          <tbody>
            {names.map((name) => (
              <tr key={name}>
                <td className="w-1/3 pr-2 align-top text-sky-300">{name}</td>
                <td className="break-all text-stone-100">{variables[name]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VariablesView() {
  const variables = useGameState((s) => s.variables);
  if (!variables) {
    return <div className="px-3 py-2 text-xs text-stone-500">Pause or step the program to inspect variables.</div>;
  }
  return (
    <div className="h-full space-y-3 overflow-y-auto px-3 py-2 font-mono text-xs">
      {variables.locals && <VariableTable title="Locals" variables={variables.locals} />}
      <VariableTable title="Globals" variables={variables.globals} />
    </div>
  );
}

export function OutputWindow({ onClose }: { onClose: () => void }) {
  const { loop } = useGame();
  const [tab, setTab] = useState<Tab>('output');
  const tabClass = (value: Tab) => `farm-tab ${tab === value ? 'farm-tab-active' : ''}`;

  return (
    <FloatingWindow
      id="output"
      title={
        <span className="flex items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" className={tabClass('output')} onClick={() => setTab('output')}>
            output
          </button>
          <button type="button" className={tabClass('variables')} onClick={() => setTab('variables')}>
            variables
          </button>
        </span>
      }
      initialRect={{ x: Math.max(16, window.innerWidth - 540), y: Math.max(260, window.innerHeight - 220), width: 520, height: 190 }}
      trailingActions={
        tab === 'output' ? (
          <WindowButton title="Clear output" onClick={() => loop.clearConsole()}>
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
              <path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </WindowButton>
        ) : null
      }
      onClose={onClose}
    >
      {tab === 'output' ? <OutputView /> : <VariablesView />}
    </FloatingWindow>
  );
}
