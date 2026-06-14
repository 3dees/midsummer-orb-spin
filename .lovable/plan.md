# Grid fills from pool size

Make the grid feel like it grows with the player. Early on it's mostly empty wood; every drafted symbol literally adds another lit cell.

## Rules

- Filled cells = `pool.length`, capped at `GRID_SIZE` (20).
- The pool is an exact set of symbol instances, like physical tiles in a bag — not a list of symbol types to sample from.
- Each spin, shuffle the exact player pool, pick random distinct cell indexes from the 20, and place every owned instance once; the rest render as empty (dark) cells.
- Starting pool shrinks from 8 → **5 symbols**, biased toward Fireflies so the first plays feel cheap and gentle:
  `[firefly, firefly, firefly, fern, mushroom]`
  → opens with 5 filled cells out of 20.
- After each draft pick, that exact new symbol instance is permanently added to the pool and appears once on every future spin. After ~15 drafts the grid is fully lit.
- Skipping a draft does not grow the grid — the tension of "do I add this?" now also means "do I add another lit cell?".

## Scoring

- Empty cells contribute 0 orbs.
- Lantern adjacency still uses orthogonal neighbours, but only counts neighbours that are filled (an empty cell can't receive +1). Same for Mushroom set count (empties don't count). No other scoring changes.

## UI

- Hide the player-facing pool strip and the "Pool: N symbols" hint in `SpinBar` entirely. Per the Luck Be a Landlord reference, the player only sees what's on the grid and the 3 draft offers — never the full pool.
- Empty cells render as a dim, slightly inset slot (no sprite) so the player can see the grid growing.
- Keep all overlays, tithe flow, animations, embers/orbs HUD, and draft UI exactly as they are.

## Files touched

- `src/lib/midsummer/symbols.ts` — `STARTING_POOL` becomes `[firefly, firefly, firefly, fern, mushroom]`.
- `src/lib/midsummer/engine.ts` — `rollGrid(pool)` now returns `(SymbolId | null)[]` of length 20 by placing every exact pool instance once into random filled indexes; `scoreGrid` treats nulls as inert.
- `src/routes/play.tsx` — `GameState.grid` typed as `(SymbolId | null)[]`; `SlotFrame` renders empty cells for null; remove `pool-strip` and `pool-hint` from `SpinBar`; drop the unused `poolCounts` import.
- `src/styles.css` — add `.cell-empty` styling (dim inset, no sprite).

## Verification

Open `/play`, confirm: opens with exactly 5 lit cells out of 20, picking a draft adds one lit cell next spin, skipping does not, full lighting after enough drafts, tithe still triggers on spin 8.
