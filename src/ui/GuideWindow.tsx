import { useState, type ReactNode } from 'react';
import { FloatingWindow } from './FloatingWindow.tsx';
import { useGameState } from './gameContext.ts';
import { GUIDE_TOPICS, type GuideBlock, type GuideTopic } from './guideTopics.ts';

/** Renders `backticked` parts of a guide sentence as inline code. */
function RichText({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="farm-guide-inline-code">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

function CodeExample({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => setCopied(false));
  };
  return (
    <div className="relative">
      <pre className="farm-guide-code">{code}</pre>
      <button type="button" className="farm-chip absolute top-1.5 right-1.5 text-[11px]" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Block({ block }: { block: GuideBlock }): ReactNode {
  switch (block.kind) {
    case 'text':
      return (
        <p className="leading-relaxed text-stone-200">
          <RichText text={block.text} />
        </p>
      );
    case 'code':
      return <CodeExample code={block.code} />;
    case 'entry':
      return (
        <div>
          <code className="farm-guide-signature">{block.signature}</code>
          <p className="mt-1 leading-relaxed text-stone-300">
            <RichText text={block.text} />
          </p>
        </div>
      );
  }
}

/** The guide: a page for every feature unlocked so far, with descriptions and examples, like the game's info window. */
export function GuideWindow({ onClose }: { onClose: () => void }) {
  const unlocks = useGameState((s) => s.game.unlocks);
  const available = GUIDE_TOPICS.filter((topic) => topic.unlock === null || unlocks[topic.unlock] > 0);
  const lockedCount = GUIDE_TOPICS.length - available.length;
  const [selectedId, setSelectedId] = useState(available[0]?.id ?? '');
  const selected: GuideTopic | undefined = available.find((topic) => topic.id === selectedId) ?? available[0];

  return (
    <FloatingWindow
      id="guide"
      title="Guide"
      initialRect={{ x: 500, y: 90, width: 640, height: Math.min(520, window.innerHeight - 140) }}
      onClose={onClose}
    >
      <div className="flex h-full min-h-0 text-sm">
        <nav className="w-44 shrink-0 overflow-y-auto border-r border-[#333] py-1" aria-label="Guide pages">
          {available.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className={`farm-guide-nav ${topic.id === selected?.id ? 'farm-guide-nav-active' : ''}`}
              onClick={() => setSelectedId(topic.id)}
            >
              {topic.title}
            </button>
          ))}
          {lockedCount > 0 && (
            <p className="px-3 pt-2 text-xs text-stone-500">
              {lockedCount} more {lockedCount === 1 ? 'page appears' : 'pages appear'} as you unlock new things.
            </p>
          )}
        </nav>
        {selected && (
          <article className="min-w-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <h2 className="text-lg font-bold text-white">{selected.title}</h2>
            {selected.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </article>
        )}
      </div>
    </FloatingWindow>
  );
}
