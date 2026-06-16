# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Midsummer Slots** — a roguelite slot-machine game set in a midsummer-night forest. The player spins a 5×4 grid of symbols drawn from their "bag" (pool), scores Light Orbs via symbol synergies, and must bank enough orbs to pay each scheduled **tithe** before running out of spins. Between tithes they draft new symbols. Originally scaffolded by [Lovable](https://lovable.dev).

## Commands

This project uses **Bun** (see `bun.lock`, `bunfig.toml`) — not npm/pnpm.

```bash
bun install              # install deps (24h supply-chain guard via bunfig.toml minimumReleaseAge)
bun dev                  # vite dev server
bun run build            # production build (nitro → Cloudflare target)
bun run build:dev        # build in development mode
bun run preview          # preview a production build
bun run lint             # eslint .
bun run format           # prettier --write .
```

**No unit-test framework is configured.** The only automated check is a Monte-Carlo simulation that verifies draft rarity distributions match the season thresholds:

```bash
bun scripts/pickDraftDistribution.ts
```

Run it after changing `pickDraft` or the rarity thresholds in `engine.ts`.

## Architecture

### Framework stack
- **TanStack Start** (SSR React framework) + **TanStack Router** with **file-based routing**.
- **React 19**, **Vite 8**, **Tailwind CSS 4**, **shadcn/ui** components (Radix primitives) in `src/components/ui/`.
- Path alias `@/*` → `src/*`.

### Build config — do not touch plugins
`vite.config.ts` extends `@lovable.dev/vite-tanstack-config`, which **already bundles** tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (Cloudflare target), the `@` alias, React/TanStack dedupe, and dev-only tooling. **Do not add these plugins manually** — duplicates break the app. Add extra config via `defineConfig({ vite: { ... } })` only.

### Routing
- Routes live in `src/routes/`. File-based — see `src/routes/README.md` for the naming conventions (this is TanStack Start, **not** Next.js/Remix; no `src/pages/`, no `app/layout.tsx`).
- `src/routes/__root.tsx` is the only app shell; preserve its `<Outlet />`.
- `src/routes/index.tsx` (`/`) just redirects to `/play`.
- `src/routes/routeTree.gen.ts` is **auto-generated — never edit by hand**.
- SSR entry/error wrappers: `src/server.ts`, `src/start.ts`, `src/router.tsx`.

### Game logic lives in `src/lib/midsummer/` (this is where most work happens)

The design is **data-driven**: symbols declare their effects as data, and a single engine walks that data. Three files:

- **`symbols.ts`** — the symbol registry (`SYMBOLS`). Each `SymbolDef` declares `baseValue`, `tags`, and a `synergies[]` array. **Adding a new symbol is data-only** — no engine change needed for any already-supported synergy type. Also defines: the `Synergy` discriminated union (the full vocabulary of effects), `SymbolId` union, `SYNERGY_GROUPS` (named symbol clusters for tooltips/highlights), `STARTING_POOL` (the 5 starter tiles), `DRAFT_POOL` (what's offered in drafts), and `symbolMatches(target, id)` which resolves a synergy target string against a symbol's id/tags/`"all"`.

- **`engine.ts`** — **pure game logic, no React**. Key exports:
  - `scoreGrid(tileGrid, ctx)` — the scorer. Walks every cell's `synergies[]` through one big `switch` on `syn.type`. **Adding a new synergy *type* means extending that switch once** (and adding the variant to the `Synergy` union in `symbols.ts`). Many synergy types are declared but are **v2 placeholders** — listed in the switch's no-op block and preserved only for tooltip text; don't assume a declared synergy is executed.
  - `rollGrid(pool)` — Fisher-Yates shuffle of tiles into random cells.
  - `pickDraft(candidates, titheIndex)` — rarity-weighted draft offers; thresholds widen toward rares as `titheIndex` rises ("seasons").
  - `TITHE_SCHEDULE` — derived from `BASE_TITHE_COSTS × DIFFICULTY` and `TITHE_SPINS`. **`DIFFICULTY` (currently 2.2) is the single knob to rescale the whole tithe economy.**
  - `PoolTile` — a physical tile instance with a `uid` and an `age` (ages independently; some synergies like `spinCounter` read it).

- **`features.ts`** — `FEATURES` flags (`items`, `essences`) — both `false`; gate stubbed UI. Flip to enable.

### `src/routes/play.tsx` — the entire game UI (~1400 lines)
A single `useReducer` state machine drives everything:
- `Phase` union (`idle` | `spinning` | `tithe-passed` | `tithe-failed` | `draft` | `green-man-upgrade` | `win` | `loss`) is the game's mode.
- `Action` union (`BEGIN_SPIN`, `RESOLVE_SPIN`, `ACK_TITHE_PASS`, `PICK_DRAFT`, `REROLL_DRAFT`, `SKIP_DRAFT`, `REMOVE_FROM_POOL`, `ACK_GREEN_MAN`, `RESTART`) — all game transitions go through `reducer`.
- `GameState` holds the pool, grid, orb counters, `titheRound`/`spinInCycle`, `appearanceCounts` (per-symbol-id tick counters for `periodicReward`/`transform`), and `last*` fields snapshotting the most recent spin for the reveal animation.
- A separate `reveal` `useState` drives the staged spin reveal (`cells` → `rewards` → `total` → `done`); post-spin overlays are gated until the reveal finishes.

### Sprites
Symbol art lives in `src/assets/sprites/*.png`, imported by name in `symbols.ts` and attached to each `SymbolDef.sprite`.

## Reference docs in-repo
- `SYMBOLS_CATALOG.md` — catalog of symbols (drop rates, payouts, effects), derived from the Luck Be A Landlord wiki for design reference.
- `src/routes/README.md` — file-based routing conventions.

## Conventions
- Prettier: 100 col, double quotes, semicolons, trailing commas all (`.prettierrc`).
- TypeScript `strict` is on; `noUnusedLocals`/`noUnusedParameters` are off.
- Keep `engine.ts` free of React/DOM — it's pure and is imported by the headless simulation script.
