// Midsummer Slots — pure game logic.
//
// Data-driven scorer: walks each cell's `synergies[]` and applies them
// generically. Adding a new symbol is data-only; adding a new synergy type
// means extending the `switch` below once.

import {
  SYMBOLS,
  symbolMatches,
  groupsForSymbol,
  type Reward,
  type Synergy,
  type SymbolId,
  type SynergyGroupId,
} from "./symbols";

export const GRID_COLS = 5;
export const GRID_ROWS = 4;
export const GRID_SIZE = GRID_COLS * GRID_ROWS;

/** Per-tithe schedule: spins allotted before the tithe is due, and orb cost. */
export interface TitheStep {
  spins: number;
  orbs: number;
}
/** Single knob to scale the entire tithe curve. Tune from live play. */
export const DIFFICULTY = 2.2;
const BASE_TITHE_COSTS = [25, 50, 100, 150, 225, 300, 375, 450, 575, 650, 700, 777];
const TITHE_SPINS = [5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10];
export const TITHE_SCHEDULE: TitheStep[] = BASE_TITHE_COSTS.map((base, i) => ({
  spins: TITHE_SPINS[i],
  orbs: Math.round(base * DIFFICULTY),
}));

/** Max Removal Orbs the player can stockpile — extras are wasted. */
export const REMOVAL_ORB_CAP = 3;

/** A single physical tile in the player's bag — ages independently. */
export interface PoolTile {
  uid: string;
  id: SymbolId;
  age: number;
}

let _uid = 0;
export function makeTile(id: SymbolId): PoolTile {
  _uid += 1;
  return { uid: `t${_uid}-${Math.random().toString(36).slice(2, 7)}`, id, age: 0 };
}

export interface ScoreContext {
  totalSpins: number;
  roundNumber: number;
  appearanceCounts: Record<string, number>;
  destroyedThisRun: number;
  alternatingTick: boolean;
}

export type SpinEvent =
  | { kind: "base"; cell: number; id: SymbolId; orbs: number }
  | {
      kind: "synergy";
      cell: number;
      id: SymbolId;
      synergyType: Synergy["type"];
      description: string;
      orbsDelta?: number;
      multiplier?: number;
      rewardKind?: Reward;
      rewardAmount?: number;
      group?: SynergyGroupId;
      greenManBoost?: boolean;
    }
  | { kind: "transform"; cell: number; from: SymbolId; to: SymbolId };

export interface ScoreResult {
  orbs: number;
  rerollOrbsGained: number;
  removalOrbsGained: number;
  perCell: number[];
  contributingCells: Set<number>;
  appearanceCountsNext: Record<string, number>;
  events: SpinEvent[];
}

/** Place exact pool tiles into random cells, leaving the rest null. */
export function rollGrid(pool: PoolTile[]): (PoolTile | null)[] {
  const grid: (PoolTile | null)[] = new Array(GRID_SIZE).fill(null);
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

/** Convenience: ids-only view of a tile grid. */
export function idsOf(grid: (PoolTile | null)[]): (SymbolId | null)[] {
  return grid.map((t) => (t ? t.id : null));
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
  tileGrid: (PoolTile | null)[],
  ctx: ScoreContext,
): ScoreResult {
  const grid: (SymbolId | null)[] = idsOf(tileGrid);
  const perCell = new Array<number>(GRID_SIZE).fill(0);
  const multCell = new Array<number>(GRID_SIZE).fill(1);
  const contributing = new Set<number>();
  const events: SpinEvent[] = [];
  const greenManOnGrid = gridHas(grid, "green_man");
  const greenManTags = new Set(["forest_floor", "flower"]);

  const rewards: Record<Reward, number> = {
    light_orbs: 0,
    reroll_orb: 0,
    removal_orb: 0,
  };

  // Dedupe one-shot global rewards: if many tiles of the same id share the
  // same synergy instance reference, only fire once per spin.
  const firedGlobals = new Set<Synergy>();

  // 1. Base values.
  for (let i = 0; i < GRID_SIZE; i++) {
    const id = grid[i];
    if (!id) continue;
    perCell[i] = SYMBOLS[id].baseValue;
    if (perCell[i] > 0) {
      contributing.add(i);
      events.push({ kind: "base", cell: i, id, orbs: perCell[i] });
    }
  }

  // 2. Apply each cell's synergies.
  for (let i = 0; i < GRID_SIZE; i++) {
    const id = grid[i];
    if (!id) continue;
    const def = SYMBOLS[id];

    for (const syn of def.synergies as Synergy[]) {
      switch (syn.type) {
        case "adjacentBonus": {
          if (syn.targets.includes("all")) {
            for (const n of neighbors(i)) {
              if (grid[n] == null) continue;
              perCell[n] += syn.bonus;
              contributing.add(n);
              events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, orbsDelta: syn.bonus });
            }
            contributing.add(i);
          } else {
            // Green Man treats forest_floor / flower targets as adjacent
            // grid-wide (not just orthogonal neighbours).
            const useGlobal =
              greenManOnGrid && syn.targets.some((t) => greenManTags.has(t));
            const scanIndexes = useGlobal
              ? Array.from({ length: GRID_SIZE }, (_, k) => k).filter((k) => k !== i)
              : neighbors(i);
            let matches = 0;
            for (const n of scanIndexes) {
              const nid = grid[n];
              if (nid == null) continue;
              if (syn.targets.some((t) => symbolMatches(t, nid))) matches++;
            }
            if (matches > 0) {
              perCell[i] += syn.bonus * matches;
              contributing.add(i);
              events.push({
                kind: "synergy", cell: i, id, synergyType: syn.type,
                description: syn.description, orbsDelta: syn.bonus * matches,
                greenManBoost: useGlobal,
                group: useGlobal ? "green_blessing" : undefined,
              });
            }
          }
          break;
        }
        case "globalBonus": {
          if (syn.targets.includes("all")) {
            for (let j = 0; j < GRID_SIZE; j++) {
              if (j === i) continue;
              if (grid[j] == null) continue;
              perCell[j] += syn.bonus;
              contributing.add(j);
            }
            contributing.add(i);
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, orbsDelta: syn.bonus });
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
              events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, orbsDelta: syn.bonus * matches });
            }
          }
          break;
        }
        case "globalMultiplier": {
          const count = gridCount(grid, syn.targets);
          if (syn.requires != null && count < syn.requires) break;
          let touched = false;
          for (let j = 0; j < GRID_SIZE; j++) {
            const jid = grid[j];
            if (jid == null) continue;
            if (syn.targets.some((t) => symbolMatches(t, jid))) {
              multCell[j] *= syn.multiplier;
              contributing.add(j);
              touched = true;
            }
          }
          if (touched) events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, multiplier: syn.multiplier });
          break;
        }
        case "multipleBonus": {
          if (gridCount(grid, syn.targets) >= syn.requires) {
            multCell[i] *= syn.multiplier;
            contributing.add(i);
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, multiplier: syn.multiplier });
          }
          break;
        }
        case "conditionalBonus": {
          const present = syn.presentTarget ? gridHas(grid, syn.presentTarget) : true;
          const absent = syn.absentTarget ? !gridHas(grid, syn.absentTarget) : true;
          if (present && absent) {
            perCell[i] += syn.bonus;
            contributing.add(i);
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, orbsDelta: syn.bonus });
          }
          break;
        }
        case "selfChance": {
          if (Math.random() < syn.chance) {
            multCell[i] *= syn.multiplier;
            contributing.add(i);
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, multiplier: syn.multiplier });
          }
          break;
        }
        case "globalCountReward": {
          if (gridCount(grid, syn.targets) >= syn.threshold && !firedGlobals.has(syn)) {
            firedGlobals.add(syn);
            rewards[syn.reward] += syn.amount;
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, rewardKind: syn.reward, rewardAmount: syn.amount });
          }
          break;
        }
        case "globalReward": {
          if (gridHas(grid, syn.requires) && !firedGlobals.has(syn)) {
            firedGlobals.add(syn);
            rewards[syn.reward] += syn.amount;
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, rewardKind: syn.reward, rewardAmount: syn.amount });
          }
          break;
        }
        case "periodicReward": {
          if (firedGlobals.has(syn)) break;   // one payout per symbol id per spin
          firedGlobals.add(syn);
          const before = ctx.appearanceCounts[id] ?? 0;
          const after = before + 1;
          const crossings =
            Math.floor(after / syn.every) - Math.floor(before / syn.every);
          if (crossings > 0) {
            rewards[syn.reward] += syn.amount * crossings;
            contributing.add(i);
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, rewardKind: syn.reward, rewardAmount: syn.amount * crossings });
          }
          break;
        }
        case "alternating": {
          if (ctx.alternatingTick) {
            multCell[i] *= syn.multiplier;
            contributing.add(i);
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, multiplier: syn.multiplier });
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
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, orbsDelta: syn.bonus * n });
          }
          break;
        }
        case "roundPenalty": {
          // Used by Sunbeam: halves value on odd rounds.
          const isOdd = ctx.roundNumber % 2 === 1;
          const match = syn.roundType === "odd" ? isOdd : !isOdd;
          if (match) {
            multCell[i] *= syn.multiplier;
            contributing.add(i);
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, multiplier: syn.multiplier });
          }
          break;
        }
        case "spinCounter": {
          const age = tileGrid[i]?.age ?? 0;
          const steps = syn.cap != null ? Math.min(age, syn.cap) : age;
          if (steps > 0) {
            perCell[i] += syn.bonus * steps;
            contributing.add(i);
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, orbsDelta: syn.bonus * steps });
          }
          break;
        }
        case "runningTotal": {
          const tracked =
            syn.tracks === "destroyed_symbols" ? ctx.destroyedThisRun : 0;
          const capped = Math.min(tracked, syn.cap);
          perCell[i] += syn.bonus * capped;
          if (capped > 0) {
            contributing.add(i);
            events.push({ kind: "synergy", cell: i, id, synergyType: syn.type, description: syn.description, orbsDelta: syn.bonus * capped });
          }
          break;
        }
        // v2 placeholders — data preserved for tooltips, not yet executed.
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
        case "stealAdjacent":
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
    rerollOrbsGained: rewards.reroll_orb,
    removalOrbsGained: rewards.removal_orb,
    perCell,
    contributingCells: contributing,
    appearanceCountsNext,
    events,
  };
}

export function pickDraft(candidates: SymbolId[], titheIndex: number): SymbolId[] {
  const byRarity: Record<string, SymbolId[]> = { common: [], uncommon: [], rare: [] };
  for (const id of candidates) {
    const r = SYMBOLS[id].rarity;
    if (byRarity[r]) byRarity[r].push(id);
  }

  // Season-based rarity thresholds by tithe index
  let commonThreshold: number;
  let uncommonThreshold: number;
  if (titheIndex <= 2) {
    commonThreshold = 0.65; uncommonThreshold = 1.0;
  } else if (titheIndex <= 5) {
    commonThreshold = 0.64; uncommonThreshold = 0.94;
  } else if (titheIndex <= 8) {
    commonThreshold = 0.57; uncommonThreshold = 0.86;
  } else {
    commonThreshold = 0.51; uncommonThreshold = 0.80;
  }

  const picked = new Set<SymbolId>();
  const result: SymbolId[] = [];

  while (result.length < 3) {
    const roll = Math.random();
    let rarity: string;
    if (roll < commonThreshold) rarity = "common";
    else if (roll < uncommonThreshold) rarity = "uncommon";
    else rarity = "rare";

    const pool = byRarity[rarity].filter((id) => !picked.has(id));
    if (pool.length === 0) {
      const fallback = candidates.filter((id) => !picked.has(id));
      if (fallback.length === 0) break;
      const id = fallback[Math.floor(Math.random() * fallback.length)];
      picked.add(id);
      result.push(id);
    } else {
      const id = pool[Math.floor(Math.random() * pool.length)];
      picked.add(id);
      result.push(id);
    }
  }

  return result;
}

export function poolCounts(pool: PoolTile[]): Array<[SymbolId, number]> {
  const counts = new Map<SymbolId, number>();
  for (const t of pool) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
  return Array.from(counts.entries());
}

// keep `groupsForSymbol` re-exported through engine for convenience
export { groupsForSymbol };
