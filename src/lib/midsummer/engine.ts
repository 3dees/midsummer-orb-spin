// Midsummer Slots — pure game logic. No React imports here so this file is
// easy to unit-test or reuse later.

import { SYMBOLS, type SymbolId } from "./symbols";

export const GRID_COLS = 5;
export const GRID_ROWS = 4;
export const GRID_SIZE = GRID_COLS * GRID_ROWS; // 20 cells

export const START_EMBERS = 10;
export const TITHE_INTERVAL = 8;
export const EMBERS_PER_TITHE = 5;
export const TITHE_REQUIREMENTS = [20, 35, 50]; // 3 rounds, +15 each
export const DANDELION_EMBER_INTERVAL = 4;

export interface ScoreResult {
  orbs: number;
  embersGained: number;
  bloomShardsGained: number;
  perCell: number[];
  contributingCells: Set<number>;
}

/**
 * Place the player's exact pool of symbol instances onto the grid. The pool is
 * a physical bag of tiles, not a list of symbol types to sample from: every
 * owned instance appears once per spin, in a random empty cell. The remaining
 * cells stay `null` (empty / inert).
 */
export function rollGrid(pool: SymbolId[]): (SymbolId | null)[] {
  const grid: (SymbolId | null)[] = new Array(GRID_SIZE).fill(null);
  const indexes = Array.from({ length: GRID_SIZE }, (_, i) => i);
  for (let i = indexes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }

  const tiles = [...pool];
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  const fillCount = Math.min(tiles.length, GRID_SIZE);
  for (let k = 0; k < fillCount; k++) {
    grid[indexes[k]] = tiles[k];
  }
  return grid;
}

/** Orthogonal neighbours (up/down/left/right) of a cell index. */
// TODO v2: diagonal adjacency may be added later as a purchasable upgrade via items.
function neighbors(index: number): number[] {
  const r = Math.floor(index / GRID_COLS);
  const c = index % GRID_COLS;
  const out: number[] = [];
  if (r > 0) out.push(index - GRID_COLS);
  if (r < GRID_ROWS - 1) out.push(index + GRID_COLS);
  if (c > 0) out.push(index - 1);
  if (c < GRID_COLS - 1) out.push(index + 1);
  return out;
}

/**
 * Score a grid. Returns total orbs, embers gained this spin, bloom shards
 * gained, per-cell breakdown (for floating numbers / debug) and the set of
 * cells that contributed value (for highlighting after a spin).
 */
export function scoreGrid(
  grid: (SymbolId | null)[],
  ctx: { dandelionStreak: number },
): ScoreResult & { dandelionStreakNext: number } {
  const perCell = new Array<number>(GRID_SIZE).fill(0);
  const contributing = new Set<number>();

  // 1. Base orb values.
  for (let i = 0; i < GRID_SIZE; i++) {
    const id = grid[i];
    if (!id) continue; // empty cell — inert
    const def = SYMBOLS[id];
    let value = def.baseOrbs;

    // Clover: each instance independently rolls a 10% chance to double its
    // OWN value (1 -> 2). Not the whole spin.
    if (def.id === "clover" && Math.random() < 0.1) {
      value *= 2;
    }

    perCell[i] = value;
    if (value > 0) contributing.add(i);
  }

  // 2. Lantern adjacency bonus: +1 to each orthogonal neighbour that is
  //    itself a filled cell. Empty cells cannot receive the bonus.
  for (let i = 0; i < GRID_SIZE; i++) {
    if (grid[i] !== "lantern") continue;
    contributing.add(i);
    for (const n of neighbors(i)) {
      if (grid[n] == null) continue;
      perCell[n] += 1;
      contributing.add(n);
    }
  }

  const orbs = perCell.reduce((a, b) => a + b, 0);

  // 3. Mushroom set bonus: 3+ mushrooms => +1 Bloom Shard (once per spin).
  // TODO: Bloom Shards used for Essence upgrades in v2.
  const mushroomCount = grid.filter((g) => g === "mushroom").length;
  const bloomShardsGained = mushroomCount >= 3 ? 1 : 0;

  // 4. Dandelion ember trickle: every DANDELION_EMBER_INTERVAL spins that
  // contain at least one dandelion, grant +1 Ember.
  const hasDandelion = grid.includes("dandelion");
  const dandelionStreakNext = hasDandelion ? ctx.dandelionStreak + 1 : ctx.dandelionStreak;
  const embersGained = dandelionStreakNext > 0 && dandelionStreakNext % DANDELION_EMBER_INTERVAL === 0 ? 1 : 0;

  return {
    orbs,
    embersGained,
    bloomShardsGained,
    perCell,
    contributingCells: contributing,
    dandelionStreakNext,
  };
}

/**
 * Pick three distinct draft offers from the candidate pool.
 *
 * Owned symbols are intentionally NOT excluded — drafting a duplicate of a
 * symbol you already own is the main way to bias your odds toward it.
 *
 * TODO v2: weight offers by rarity tiers, and also offer copies of symbols
 * already in the player's pool (currently only DRAFT_POOL is sampled).
 * TODO v2: Moon Tokens — let the player spend a currency to REMOVE a symbol
 * from their pool, thinning it for better odds on keepers.
 */
export function pickDraft(candidates: SymbolId[]): SymbolId[] {
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

/** Collapse a multiset pool into [symbolId, count] pairs for display. */
export function poolCounts(pool: SymbolId[]): Array<[SymbolId, number]> {
  const counts = new Map<SymbolId, number>();
  for (const id of pool) counts.set(id, (counts.get(id) ?? 0) + 1);
  return Array.from(counts.entries());
}