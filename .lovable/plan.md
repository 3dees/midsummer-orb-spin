
# Convert to Slot Builder

Rework the spin/draft loop so the player's pool is the entire game — every spin samples from a weighted pool (duplicates = higher odds), and every spin offers a draft to grow that pool.

## Changes to game logic (`src/lib/midsummer/engine.ts`, `symbols.ts`)

- `STARTING_POOL` becomes a multiset (array with duplicates), exactly:
  ```
  [firefly, firefly, fern, fern, mushroom, fox, lantern, dandelion]
  ```
  This is the literal `playerPool` — `rollGrid` already samples with replacement from it, so duplicates naturally bias the grid toward Fireflies/Ferns at the start.
- Keep `rollGrid(pool)` unchanged (random with replacement). Add a tiny `poolCounts(pool)` helper for the HUD pool display so duplicates collapse into "Firefly ×2" chips instead of two identical icons.
- `pickDraft(candidates, owned)`: change semantics — owned symbols are now ELIGIBLE to be offered again (drafting a second Fox doubles its odds). So just return 3 random distinct picks from the full `DRAFT_POOL` plus a "more of an existing symbol" slot. Simplest version: 3 random distinct symbols from `DRAFT_POOL` (no exclusion). Note in the code: TODO v2 — also offer duplicates of owned symbols and weight by rarity.

## Changes to game flow (`src/routes/play.tsx`)

- After every spin resolves, automatically enter `phase: { kind: 'draft', offers }`, regardless of whether a tithe just happened.
- Draft overlay gets a **Skip** button (always visible) in addition to the 3 cards. Picking a card or skipping returns to `phase: 'idle'` so the next Spin button press works.
- `PICK_DRAFT` appends one copy of the chosen symbol to `playerPool` (no dedupe). This is the only way the pool grows.
- Tithe still triggers on spin 8 of every cycle — it now runs **before** the draft for that spin:
  - Pass tithe → show "Tithe paid +5 Embers" overlay → continue → then the post-spin draft for spin 8 appears as normal.
  - Fail tithe → loss screen (no draft).
- Remove the old `CONTINUE_FROM_TITHE_PASS` draft (it picked from `DRAFT_POOL` minus owned). Tithe pass now just grants embers and advances the round; symbol growth is fully handled by the per-spin draft.
- HUD "Pool" strip: render unique symbols with a small count badge (e.g. `🦊 ×1`, `🌿 ×2`) so the player can read their build at a glance and feel duplicates accumulating.

## UX details

- The Spin button is hidden / disabled while the draft overlay is open — pressing Spin always means "commit to the current pool, then choose what to add."
- Skip button styled as `ghost-btn`, labeled "Skip — keep pool lean."
- Draft offers reshuffle every spin (`pickDraft` runs in the reducer when entering the draft phase).
- Add a one-line tooltip under the pool strip: "Your pool: every spin samples from these symbols. Duplicates appear more often."

## What stays the same

- All scoring (Lantern adjacency, Mushroom 3+, Clover self-double, Dandelion ember trickle).
- Tithe schedule: 8 spins, requirements 20 / 35 / 50, +5 Embers per pass, 3-round win.
- Visuals, sprites, layout, animations.

## Out of scope for this pass

- Moon Tokens / symbol removal (your point 6 — leave a TODO comment in `engine.ts`).
- Weighted draft offers based on rarity tiers.
- Offering duplicates of currently-owned symbols in the draft (TODO comment in `pickDraft`).

## Files touched

- `src/lib/midsummer/symbols.ts` — `STARTING_POOL` becomes multiset.
- `src/lib/midsummer/engine.ts` — drop owned-exclusion in `pickDraft`, add `poolCounts` helper, add TODOs.
- `src/routes/play.tsx` — reducer changes (auto-draft after every spin, draft has Skip, tithe path no longer opens its own draft), HUD pool strip with count badges.

After the change I'll spin a few times in the preview to confirm: pool grows by one when a card is picked, the grid composition visibly shifts toward newly added symbols, Skip works, and the tithe still triggers correctly on spin 8.
