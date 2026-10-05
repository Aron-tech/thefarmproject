import { FarmScene } from '../rendering/FarmScene.tsx';

export function App() {
  return (
    <div className="flex h-full flex-col text-stone-100">
      <header className="flex items-center justify-between border-b border-stone-700 px-4 py-2">
        <h1 className="text-lg font-semibold">The Farm Project</h1>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <section className="min-h-64">
          <FarmScene />
        </section>
        <section className="flex items-center justify-center border-t border-stone-700 text-stone-500 md:border-t-0 md:border-l">
          Code editor (M1)
        </section>
      </main>
    </div>
  );
}
