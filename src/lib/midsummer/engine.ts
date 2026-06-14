// Midsummer Slots — pure game logic.
//
// Data-driven scorer: walks each cell's `synergies[]` and applies them
// generically. Adding a new symbol is data-only; adding a new synergy type
// means extending the `switch` below once.

import {
  SYMBOLS,
  symbolMatches,
  type Reward,
  type Synergy,
  type SymbolId,
} from "./symbols";

export const GRID_COLS = 5;
export const GRID_ROWS = 4;
export const GRID_SIZE = GRID_COLS * GRID_ROWS;

export const START_EMBERS = 10;
export const TITHE_INTERVAL = 8;
export const EMBERS_PER_TITHE = 5;
export const TITHE_REQUIREMENTS = [20, 35, 50];

export interface ScoreContext {
  totalSpins: number;
  roundNumber: number;
  appearanceCounts: Record<string, number>;
  destroyedThisRun: number;
  alternatingTick: boolean;
}

export interface ScoreResult {
  orbs: number;
  embersGained: number;
  bloomShardsGained: number;
  moonTokensGained: number;
  perCell: number[];
  contributingCells: Set<number>;
  appearanceCountsNext: Record<string, number>;
}

/** Place exact pool tiles into random cells, leaving the rest null. */
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
  for (let k = 0; k < fillCount; k++) grid[indexes[k]] = tiles[k];
  return grid;
}

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

function gridHas(grid: (SymbolId | null)[], target: string): boolean {
  return grid.some((id) => id != null && symbolMatches(target, id));
}

function gridCount(grid: (SymbolId | null)[], targets: string[]): number {
  let n = 0;
  for (const id of grid) {
    if (id == null) continue;
    if (targets.some((t) => symbolMatches(t, id))) n++;
  }
  return n;
}

export function scoreGrid(
  grid: (SymbolId | null)[],
  ctx: ScoreContext,
): ScoreResult {
  const perCell = new Array<number>(GRID_SIZE).fill(0);
  const multCell = new Array<number>(GRID_SIZE).fill(1);
  const contributing = new Set<number>();

  const rewards: Record<Reward, number> = {
    light_orbs: 0,
    embers: 0,
    bloom_shard: 0,
    moon_token: 0,
  };

  // Dedupe one-shot global rewards: if many tiles of the same id share the
  // same synergy instance reference, only fire once per spin.
  const firedGlobals = new Set<Synergy>();

  // 1. Base values.
  for (let i = 0; i < GRID_SIZE; i++) {
    const id = grid[i];
    if (!id) continue;
    perCell[i] = SYMBOLS[id].baseValue;
    if (perCell[i] > 0) contributing.add(i);
  }

  // 2. Apply each cell's synergies.
  for (let i = 0; i < GRID_SIZE; i++) {
    const id = grid[i];
    if (!id) continue;
    const def = SYMBOLS[id];

    for (const syn of def.synergies as Synergy[]) {
      switch (syn.type) {
        case "adjacentBonus": {
          // Convention: targets=["all"] is an outgoing buff to neighbours
          // (e.g. Lantern). Otherwise it's an inbound bonus to self.
          if (syn.targets.includes("all")) {
            for (const n of neighbors(i)) {
              if (grid[n] == null) continue;
              perCell[n] += syn.bonus;
              contributing.add(n);
            }
            contributing.add(i);
          } else {
            for (const n of neighbors(i)) {
              const nid = grid[n];
              if (nid == null) continue;
              if (syn.targets.some((t) => symbolMatches(t, nid))) {
                perCell[i] += syn.bonus;
                contributing.add(i);
              }
            }
          }
          break;
        }
        case "globalBonus": {
          if (syn.targets.includes("all")) {
            // "All symbols +1" (Solstice Flame): push outward to every other
            // filled tile.
            for (let j = 0; j < GRID_SIZE; j++) {
              if (j === i) continue;
              if (grid[j] == null) continue;
              perCell[j] += syn.bonus;
              contributing.add(j);
            }
            contributing.add(i);
          } else {
            let matches = 0;
            for (let j = 0; j < GRID_SIZE; j++) {
              if (j === i) continue;
              const jid = grid[j];
              if (jid == null) continue;
              if (syn.targets.some((t) => symbolMatches(t, jid))) matches++;
            }
            if (matches > 0) {
              perCell[i] += syn.bonus * matches;
              contributing.add(i);
            }
          }
          break;
        }
        case "globalMultiplier": {
          const count = gridCount(grid, syn.targets);
          if (syn.requires != null && count < syn.requires) break;
          for (let j = 0; j < GRID_SIZE; j++) {
            const jid = grid[j];
            if (jid == null) continue;
            if (syn.targets.some((t) => symbolMatches(t, jid))) {
              multCell[j] *= syn.multiplier;
              contributing.add(j);
            }
          }
          break;
        }
        case "multipleBonus": {
          if (gridCount(grid, syn.targets) >= syn.requires) {
            multCell[i] *= syn.multiplier;
            contributing.add(i);
          }
          break;
        }
        case "conditionalBonus": {
          const present = syn.presentTarget ? gridHas(grid, syn.presentTarget) : true;
          const absent = syn.absentTarget ? !gridHas(grid, syn.absentTarget) : true;
          if (present && absent) {
            perCell[i] += syn.bonus;
            contributing.add(i);
          }
          break;
        }
        case "selfChance": {
          if (Math.random() < syn.chance) {
            multCell[i] *= syn.multiplier;
            contributing.add(i);
          }
          break;
        }
        case "globalCountReward": {
          if (gridCount(grid, syn.targets) >= syn.threshold && !firedGlobals.has(syn)) {
            firedGlobals.add(syn);
            rewards[syn.reward] += syn.amount;
          }
          break;
        }
        case "globalReward": {
          if (gridHas(grid, syn.requires) && !firedGlobals.has(syn)) {
            firedGlobals.add(syn);
            rewards[syn.reward] += syn.amount;
          }
          break;
        }
        case "periodicReward": {
          const before = ctx.appearanceCounts[id] ?? 0;
          const after = before + 1;
          const crossings =
            Math.floor(after / syn.every) - Math.floor(before / syn.every);
          if (crossings > 0) {
            rewards[syn.reward] += syn.amount * crossings;
            contributing.add(i);
          }
          break;
        }
        case "alternating": {
          if (ctx.alternatingTick) {
            multCell[i] *= syn.multiplier;
            contributing.add(i);
          }
          break;
        }
        case "roundBonus": {
          const isOdd = ctx.roundNumber % 2 === 1;
          const match = syn.roundType === "odd" ? isOdd : !isOdd;
          if (!match) break;
          const n = gridCount(grid, syn.targets);
          if (n > 0) {
            perCell[i] += syn.bonus * n;
            contributing.add(i);
          }
          break;
        }
        case "spinCounter": {
          perCell[i] += syn.bonus * ctx.totalSpins;
          if (ctx.totalSpins > 0) contributing.add(i);
          break;
        }
        case "runningTotal": {
          const tracked =
            syn.tracks === "destroyed_symbols" ? ctx.destroyedThisRun : 0;
          const capped = Math.min(tracked, syn.cap);
          perCell[i] += syn.bonus * capped;
          if (capped > 0) contributing.add(i);
          break;
        }
        // v2 placeholders.
        case "transform":
        case "destroyAdjacent":
        case "destroyBonus":
        case "sacrifice":
        case "periodicSpawn":
        case "consumeOnTithe":
        case "copyAdjacent":
        case "treatAsAdjacent":
        case "transformCommon":
        case "titheReduction":
        case "exactTitheBonus":
        case "passive":
        case "note":
          break;
      }
    }
  }

  // 3. Fold multipliers, clamp at 0.
  for (let i = 0; i < GRID_SIZE; i++) {
    perCell[i] = Math.max(0, Math.round(perCell[i] * multCell[i]));
  }

  // 4. Advance per-id appearance counts (one tick per id present this spin).
  const appearanceCountsNext: Record<string, number> = { ...ctx.appearanceCounts };
  const seen = new Set<SymbolId>();
  for (const id of grid) {
    if (id) seen.add(id);
  }
  for (const id of seen) {
    appearanceCountsNext[id] = (appearanceCountsNext[id] ?? 0) + 1;
  }

  const orbs = perCell.reduce((a, b) => a + b, 0) + rewards.light_orbs;

  return {
    orbs,
    embersGained: rewards.embers,
    bloomShardsGained: rewards.bloom_shard,
    moonTokensGained: rewards.moon_token,
    perCell,
    contributingCells: contributing,
    appearanceCountsNext,
  };
}

export function pickDraft(candidates: SymbolId[]): SymbolId[] {
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

export function poolCounts(pool: SymbolId[]): Array<[SymbolId, number]> {
  const counts = new Map<SymbolId, number>();
  for (const id of pool) counts.set(id, (counts.get(id) ?? 0) + 1);
  return Array.from(counts.entries());
}
