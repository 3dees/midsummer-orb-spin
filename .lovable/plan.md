
# Midsummer Slots — Prototype Plan

A roguelite slot machine prototype built as a TanStack route at `/play`, with the home `/` route redirecting to it so the preview shows the game immediately.

## Scope

- Single self-contained React route (one component file + one game-logic module) so it's easy to read in Cursor/VS Code later.
- Portrait 9:16 stage, centered in any viewport, mobile-touch friendly.
- All state in memory (React `useReducer`). No backend, no persistence.

## Asset plan

Uploaded sprites used as-is (via Lovable Assets CDN pointers):
- `final_background.png` → forest background
- `mushroom.png`, `fox.png` → symbol art
- `flame.png` → Ember icon
- `crown.png` → win-screen flourish
- `best_machine.png` / `machine_best2.png` → reference only (custom CSS frame instead, per your choice)

Generated pixel-art sprites (same style as uploads, transparent PNGs, ~256px) for the missing symbols:
- Starting pool: Firefly, Fern, Lantern, Dandelion
- Draft pool: Moth, Clover, Rabbit, Owl, Honeybee, Crow, Hedgehog
- Plus a Light Orb icon for the HUD

Each is generated once via `imagegen--generate_image` (transparent_background=true) into `src/assets/sprites/` and imported normally.

## UI layout

```
+---------------------------------+
| Forest background (fixed)       |
|  +---------------------------+  |
|  |  HUD: 🔥10  ✦0  💠0       |  |  top status bar
|  |  Spin 3 / 8 · Tithe: 20   |  |  tithe progress
|  +---------------------------+  |
|  |   ╔═══ slot frame ═══╗    |  |
|  |   ║ . . . . .        ║    |  |  5 cols
|  |   ║ . . . . .        ║    |  |  4 rows
|  |   ║ . . . . .        ║    |  |
|  |   ║ . . . . .        ║    |  |
|  |   ╚═══════════════════╝    |  |
|  |                           |  |
|  |  [   SPIN  (-1 🔥)   ]    |  |  big button
|  +---------------------------+  |
+---------------------------------+
```

Custom slot frame built in CSS: dark teal cells with rounded corners, thin gold dividers, warm ember glow at the base, ivy/foxglove accents via gradients — matches the machine concept without trying to align to its painted grid.

Overlay screens (absolutely positioned over the stage):
- **Tithe warning** — appears on spin 7 and 8 of a cycle (pulsing bell + orbs needed).
- **Tithe result** — pass = continue to draft; fail = Loss screen.
- **Draft** — 3 random symbol cards from the available pool; click to add.
- **Win** — after surviving all 3 tithe rounds (crown.png centerpiece).
- **Loss** — dim overlay, "Try again" button reseeds state.

## Game logic

`src/lib/midsummer/engine.ts` — pure functions, no React:
- `SYMBOLS` registry with `{ id, name, sprite, baseOrbs, tags }`.
- `rollGrid(pool)` → 20 symbol ids.
- `scoreGrid(grid)` returns `{ orbs, embers, bloomShards, contributingCells: Set<number>, perCell: number[] }`:
  - Sum base orbs per cell.
  - **Lantern**: +1 orb to each orthogonal neighbor (up/down/left/right). Comment: `// TODO v2: diagonal adjacency unlock via item.`
  - **Mushroom**: if grid contains ≥3 mushrooms, +1 Bloom Shard (once per spin).
  - **Clover**: each instance independently 10% chance to double its own value (1→2). Comment per spec.
  - **Dandelion**: increments a `spinsSinceEmber` counter on the dandelion symbol; every 4 spins where ≥1 dandelion appears, +1 Ember. (Simpler interpretation kept in code comment.)
- `applyTithe(state)` checks `orbs >= required`, resets cycle, increments tithe stage.

`src/routes/play.tsx`:
- `useReducer` over `GameState { embers, orbs, bloomShards, pool, grid, spinInCycle, titheStage, titheRequired, phase, lastScore, contributingCells }`.
- Actions: `SPIN`, `RESOLVE_SPIN`, `OPEN_TITHE`, `PAY_TITHE`, `PICK_DRAFT`, `RESTART`.
- Spin flow:
  1. Deduct 1 ember, set `phase: 'spinning'`, fill grid with random placeholders.
  2. After 600ms (CSS fade/scale-in stagger per cell), set final grid + score, `phase: 'resolved'`.
  3. Floating "+N ✦" number animates up from the spin button.
  4. Contributing cells get a warm glow ring for 1.2s.
  5. On spin 8 → run tithe check after scoring.

## Constants

```ts
START = { embers: 10, orbs: 0, bloomShards: 0 }
START_POOL = ['firefly','fern','mushroom','fox','lantern','dandelion']
TITHE_REQS = [20, 35, 50]   // +15 each round, 3 rounds total
TITHE_INTERVAL = 8
EMBERS_PER_TITHE = 5
DRAFT_POOL = ['moth','clover','rabbit','owl','honeybee','crow','hedgehog']
```

## Routing

- `src/routes/play.tsx` — the game.
- `src/routes/index.tsx` — replace placeholder with a `<Navigate to="/play" replace />` so the preview lands on the game.

## Styling

- Tailwind + a small scoped CSS block for the slot frame gradient and the pixel-art `image-rendering: pixelated` rule on every sprite.
- Cell size derived from container width so the 5×4 grid stays inside the portrait frame on phones.

## What I will NOT do in this pass

- No persistence, no audio, no real item system, no Bloom Shard effects (counter only, with the TODO comment you requested).
- No diagonal Lantern adjacency (comment placed at the adjacency code).
- No animation library — pure CSS keyframes and the existing Tailwind animate utilities.

## File touch list

- `src/assets/*.asset.json` — pointers for uploaded sprites + background.
- `src/assets/sprites/*.png` — generated pixel-art for missing symbols.
- `src/lib/midsummer/engine.ts` — game logic.
- `src/lib/midsummer/symbols.ts` — symbol registry.
- `src/routes/play.tsx` — game UI/state.
- `src/routes/index.tsx` — redirect to `/play`.
- `src/styles.css` — small additions for frame glow + pixel-rendering helper class.

After the build I'll verify by loading `/play`, spinning a few times, and confirming scoring, tithe trigger on spin 8, draft picker, and win/loss overlays all behave.
