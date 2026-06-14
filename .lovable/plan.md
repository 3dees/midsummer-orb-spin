# Full symbol set + data-driven synergies

Replace the current hand-coded scoring with a data-driven synergy engine that reads each symbol's `synergies` array. Add the full 30-symbol roster (commons, uncommons, rares, very-rares, bonus) with tags, rarity, base values, and per-symbol synergy rules.

## Scope of this change

- Rewrite `src/lib/midsummer/symbols.ts` to define every symbol per the spec: `id`, `name`, `rarity`, `emoji`, `baseValue`, `tags`, `sprite`, `synergies[]`.
- Rewrite `src/lib/midsummer/engine.ts` scorer to walk synergies generically.
- Extend game state in `src/routes/play.tsx` with run-level counters that synergies need (spinCount, destroyedThisRun, dandelionStreak → moonTokenStreak, beehiveSpawnStreak, snailAlternator, moonTokens, transform timers on grid tiles).
- Keep all existing UI (grid, tithe flow, draft, pool modal, embers/orbs HUD) intact; only the math and the set of available symbols change.

## Synergy engine — supported types (v1)

Implemented now, applied after the grid is rolled, before display:

- `adjacentBonus { targets, bonus }` — `targets` is symbol ids and/or tags; `'all'` means any filled neighbour.
- `globalBonus { targets, bonus }` — +bonus per matching symbol elsewhere on the grid (self excluded).
- `globalMultiplier { targets, multiplier, requires? }` — multiplies value of every matching symbol on the grid; optional `requires` = min count of targets on grid.
- `multipleBonus { requires, targets, multiplier }` — multiplies own value if grid contains `requires`+ of `targets`.
- `conditionalBonus { presentTarget?|absentTarget?, bonus }` — +bonus depending on presence/absence of a symbol id.
- `selfChance { chance, multiplier }` — per-tile random multiplier.
- `globalCountReward { targets, threshold, reward, amount }` — bloom shards / moon tokens / embers when grid has ≥ threshold.
- `globalReward { requires, reward, amount }` — reward if symbol id present on grid.
- `periodicReward { every, reward, amount }` — per-tile streak counter; rewards every Nth spin a tile of this id appears (replaces the Dandelion ember-trickle with a Moon Token trickle, matching the new spec).
- `alternating { multiplier }` — value × multiplier on alternating spins (run-level toggle).
- `roundBonus { roundType: 'odd'|'even', targets, bonus }` — +bonus per matching symbol on odd/even round numbers.
- `spinCounter { bonus }` — +bonus × spinsThisRun (Sun Wheel).
- `runningTotal { tracks, bonus, cap }` — +bonus × tracked counter (Crow uses `destroyed_symbols`).

Stubbed (no runtime effect yet, kept in data + tooltip):
- `transform`, `destroyAdjacent`, `destroyBonus`, `sacrifice`, `periodicSpawn`, `consumeOnTithe`, `copyAdjacent`, `treatAsAdjacent`, `transformCommon`, `titheReduction`, `exactTitheBonus`, `passive`, `note`.

These are marked with a TODO v2 comment in the engine so the data is preserved and tooltips render, but they don't mutate scoring. Destruction counter (`destroyedThisRun`) is wired in state at 0 so Crow / Standing Stone read cleanly when destruction lands.

## Tag system

- `tags?: Tag[]` on each symbol.
- Synergy target matching: a target string matches if it equals the cell's symbol id, equals one of its tags, or equals `'all'`.

## State additions (`PlayPage` reducer)

- `spinCount: number` (already implicit via `spinsThisRound` — add explicit `totalSpins`).
- `destroyedThisRun: number` (init 0).
- `snailAlternator: boolean` (toggled each spin).
- `moonTokens: number` (new currency, replaces dandelion ember-trickle source).
- `tileStreaks: Record<index, Record<symbolId, number>>` — for `periodicReward` per-tile counters. Simpler: track `appearanceStreak` per symbol id at run level (one counter per id), which matches "produces every N spins" intent.

The cleaner choice — and what I'll implement — is `symbolAppearanceCounts: Record<SymbolId, number>` incremented once per spin per symbol id present. `periodicReward` fires `floor(count/every) - floor((count-1)/every)` rewards per spin per tile.

## Starting pool

Keep the existing 5-tile bag: `[firefly, firefly, firefly, fern, mushroom]`. The draft pool expands to every non-starter common + uncommon + rare from the new roster (very-rare gated behind a future weighted pool; for now appears at low odds in the draft mix).

## Sprites

Use existing sprite imports where the symbol already has art. For new symbols without sprites, render the emoji at large size centered in the cell as a fallback (no asset generation in this change). The cell renderer falls back to emoji when `sprite` is undefined.

## Files touched

- `src/lib/midsummer/symbols.ts` — full roster + types (`Rarity`, `Tag`, `Synergy` union, `SymbolDef`).
- `src/lib/midsummer/engine.ts` — generic `scoreGrid` walking synergies; export typed reward bag `{ orbs, embers, bloomShards, moonTokens }`.
- `src/routes/play.tsx` — extend reducer state with the new counters; thread `moonTokens` into HUD next to embers/orbs; pass run context into `scoreGrid`.
- `src/styles.css` — small additions: emoji-fallback cell style, moon-token HUD chip.
- `.lovable/plan.md` — refresh to describe the new system.

## Verification

Open `/play`: starts with 5 lit cells, drafts now offer the broader pool, scoring tooltips/floating numbers still appear, no console errors, tithe still triggers on spin 8, Lantern still buffs neighbours (now via data), Mushroom 3+ still grants a bloom shard, Dandelion now drips Moon Tokens every 4 appearances.
