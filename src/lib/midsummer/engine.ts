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

/** Fill the grid with random picks from the player's pool. */
export function rollGrid(pool: SymbolId[]): SymbolId[] {
  const grid: SymbolId[] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    grid.push(pool[Math.floor(Math.random() * pool.length)]);
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
  grid: SymbolId[],
  ctx: { dandelionStreak: number },
): ScoreResult & { dandelionStreakNext: number } {
  const perCell = new Array<number>(GRID_SIZE).fill(0);
  const contributing = new Set<number>();

  // 1. Base orb values.
  for (let i = 0; i < GRID_SIZE; i++) {
    const def = SYMBOLS[grid[i]];
    let value = def.baseOrbs;

    // Clover: each instance independently rolls a 10% chance to double its
    // OWN value (1 -> 2). Not the whole spin.
    if (def.id === "clover" && Math.random() < 0.1) {
      value *= 2;
    }

    perCell[i] = value;
    if (value > 0) contributing.add(i);
  }

  // 2. Lantern adjacency bonus: +1 to each orthogonal neighbour.
  for (let i = 0; i < GRID_SIZE; i++) {
    if (grid[i] !== "lantern") continue;
    contributing.add(i);
    for (const n of neighbors(i)) {
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

/** Pick three distinct draft offers from the candidate pool, excluding any already-owned. */
export function pickDraft(
  candidates: SymbolId[],
  owned: SymbolId[],
): SymbolId[] {
  const available = candidates.filter((c) => !owned.includes(c));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}