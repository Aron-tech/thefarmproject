# Project Overview & Architecture

- **Project:** Web-based clone of *The Farmer Was Replaced* (including the *The Miner Was Replaced* underground mechanics).
- **Core Stack:** Vite + React + TypeScript + Tailwind CSS.
- **Rendering:** Three.js / React Three Fiber for isometric 2.5D/3D (surface grid and underground voxel layers) with InstancedMesh optimizations; HTML5 Canvas for lightweight UI/overlays.
- **Code Editor:** Monaco Editor (`@monaco-editor/react`) with syntax highlighting and step-by-step debugging hooks.
- **Client-Side Only (No Backend):** The application is 100% serverless. All persistent state must be managed via `localStorage` or `IndexedDB` with JSON import/export capability.

# Execution & Runtime Rules

- **Execution Threading (Non-negotiable):** 
  - NEVER execute user Python code on the main browser thread.
  - All player code interpretation must run inside a dedicated **Web Worker** using Skulpt or a generator-based AST walker.
  - Communication between the game loop and the interpreter must use asynchronous messaging (`postMessage`) with explicit tick-delay handling (`await delay()`) to prevent browser freezing on infinite loops (`while True`).
- **Dev & Build Environment:**
  - Node.js runtime: Latest active version (Node.js 24+ / 22 LTS). Always target current Node runtime standards.
  - Package manager: `npm` (run `npm run dev`, `npm run build`, `npm test`).

# Code Standards & Best Practices

- **Modularity:** Keep game state, rendering, and interpreter strictly decoupled:
  - `src/core/state/`: Pure game state, grid models, crop data, and tick updates.
  - `src/core/interpreter/`: Web Worker wrapper, Python AST/runtime, and safe API exposure.
  - `src/rendering/`: Three.js / Canvas scenes and mesh managers.
  - `src/ui/`: React UI components (editor, tech tree, inventory, controls).
- **TypeScript:** Strict type checking enabled (`strict: true`). Explicit types for all grid coordinates, cell states, crops, and drone actions. Avoid `any`.
- **Naming Conventions:**
  - **Variables & Properties:** `camelCase` (e.g. `gridSize`, `cropType`, `currentDepth`)
  - **Functions & Methods:** `camelCase` (e.g. `harvestCrop()`, `updateGridTick()`)
  - **Components & Classes:** `PascalCase` (e.g. `FarmGrid`, `DroneController`, `TechTreeModal`)
  - **Constants / Enums:** `UPPER_SNAKE_CASE` (e.g. `MAX_GRID_SIZE`, `DEFAULT_TICK_RATE_MS`)
- **Existing Code:** Do not modify existing working systems unless strictly necessary for refactoring or fixing regressions.