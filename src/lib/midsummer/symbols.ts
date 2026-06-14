// Midsummer Slots — symbol registry.
//
// The full roster is data-driven: each symbol declares its `synergies[]`,
// and the engine walks those at scoring time. Adding a new symbol is just
// data — no engine changes needed for any of the supported synergy types.

import fireflyImg from "@/assets/sprites/firefly.png";
import fernImg from "@/assets/sprites/fern.png";
import lanternImg from "@/assets/sprites/lantern.png";
import dandelionImg from "@/assets/sprites/dandelion.png";
import mothImg from "@/assets/sprites/moth.png";
import cloverImg from "@/assets/sprites/clover.png";
import rabbitImg from "@/assets/sprites/rabbit.png";
import owlImg from "@/assets/sprites/owl.png";
import honeybeeImg from "@/assets/sprites/honeybee.png";
import crowImg from "@/assets/sprites/crow.png";
import hedgehogImg from "@/assets/sprites/hedgehog.png";

import mushroomAsset from "@/assets/sprites/mushroom.png.asset.json";
import foxAsset from "@/assets/sprites/fox.png.asset.json";
import crownAsset from "@/assets/sprites/crown.png.asset.json";
import flameAsset from "@/assets/sprites/flame.png.asset.json";

export type Rarity = "common" | "uncommon" | "rare" | "very_rare";

export type Tag = "forest_floor" | "flower" | "creature" | "nocturnal";

export type Reward = "light_orbs" | "embers" | "bloom_shard" | "moon_token";

/**
 * A target string is either a SymbolId, a Tag, or the literal "all".
 * Resolved at runtime against a cell's symbol id and tags.
 */
export type SynergyTarget = string;

export type Synergy =
  // --- implemented in v1 ---
  | { type: "adjacentBonus"; targets: SynergyTarget[]; bonus: number; description: string }
  | { type: "globalBonus"; targets: SynergyTarget[]; bonus: number; description: string }
  | { type: "globalMultiplier"; targets: SynergyTarget[]; multiplier: number; requires?: number; description: string }
  | { type: "multipleBonus"; requires: number; targets: SynergyTarget[]; multiplier: number; description: string }
  | { type: "conditionalBonus"; presentTarget?: SynergyTarget; absentTarget?: SynergyTarget; bonus: number; description: string }
  | { type: "selfChance"; chance: number; multiplier: number; description: string }
  | { type: "globalCountReward"; targets: SynergyTarget[]; threshold: number; reward: Reward; amount: number; description: string }
  | { type: "globalReward"; requires: SynergyTarget; reward: Reward; amount: number; description: string }
  | { type: "periodicReward"; every: number; reward: Reward; amount: number; description: string }
  | { type: "alternating"; multiplier: number; description: string }
  | { type: "roundBonus"; roundType: "odd" | "even"; targets: SynergyTarget[]; bonus: number; description: string }
  | { type: "spinCounter"; bonus: number; description: string }
  | { type: "runningTotal"; tracks: "destroyed_symbols"; bonus: number; cap: number; description: string }
  // --- v2 placeholders (data preserved, tooltip-only) ---
  | { type: "transform"; transformInto: string; afterSpins: number; description: string }
  | { type: "destroyAdjacent"; targets: SynergyTarget[]; bonus: number; description: string }
  | { type: "destroyBonus"; targets: SynergyTarget[]; bonus: number; description: string }
  | { type: "sacrifice"; reward: Reward; amount: number; description: string }
  | { type: "periodicSpawn"; every: number; spawns: string; description: string }
  | { type: "consumeOnTithe"; reward: Reward; amount: number; description: string }
  | { type: "copyAdjacent"; count: number; priority: "highest"; description: string }
  | { type: "treatAsAdjacent"; targets: SynergyTarget[]; description: string }
  | { type: "transformCommon"; count: number; transformInto: string; description: string }
  | { type: "titheReduction"; amount: number; description: string }
  | { type: "exactTitheBonus"; multiplier: number; description: string }
  | { type: "passive"; effect: string; description: string }
  | { type: "note"; description: string };

export type SymbolId =
  // commons
  | "firefly" | "fern" | "mushroom" | "acorn" | "dewdrop" | "moth"
  | "pebble" | "clover" | "sparrow" | "berry" | "dandelion" | "snail"
  // uncommons
  | "fox" | "rabbit" | "honeybee" | "lantern" | "owl" | "foxglove"
  | "oak_leaf" | "crow" | "hedgehog" | "wild_rose"
  // rares
  | "beehive" | "antler_crown" | "standing_stone" | "sun_wheel"
  | "honey_jar" | "glowing_wisp"
  // very rare
  | "solstice_flame" | "green_man"
  // bonus
  | "fairy_ring" | "moon_elixir" | "rowan_wand" | "fae_wings"
  // v2 transforms (referenced but not yet draftable)
  | "ancient_oak";

// ===== Named synergy groups (for tooltips & highlights) =====
export const SYNERGY_GROUPS = {
  nocturnal_web:   { name: "Nocturnal Web",       members: ["moth","firefly","owl","lantern","fae_wings"] as SymbolId[] },
  forest_floor:    { name: "Forest Floor",        members: ["mushroom","fern","snail","hedgehog","pebble","fairy_ring","acorn","oak_leaf","berry","ancient_oak"] as SymbolId[] },
  pollinator:      { name: "Pollinator Chain",    members: ["honeybee","foxglove","beehive","honey_jar"] as SymbolId[] },
  predator_prey:   { name: "Predator & Prey",     members: ["fox","rabbit"] as SymbolId[] },
  ancient_circle:  { name: "Ancient Circle",      members: ["standing_stone","sun_wheel","antler_crown"] as SymbolId[] },
  wild_garden:     { name: "Wild Garden",         members: ["wild_rose","foxglove","dewdrop","dandelion"] as SymbolId[] },
  murder_of_crows: { name: "Murder of Crows",     members: ["crow"] as SymbolId[] },
  green_blessing:  { name: "Green Man Blessing",  members: ["green_man","fern","mushroom","acorn","oak_leaf","dewdrop","foxglove","wild_rose","dandelion"] as SymbolId[] },
} as const;
export type SynergyGroupId = keyof typeof SYNERGY_GROUPS;

export function groupsForSymbol(id: SymbolId): SynergyGroupId[] {
  const out: SynergyGroupId[] = [];
  for (const key of Object.keys(SYNERGY_GROUPS) as SynergyGroupId[]) {
    if (SYNERGY_GROUPS[key].members.includes(id)) out.push(key);
  }
  return out;
}

/** Uncommon ids — used by Green Man's transformCommon when drafted. */
export const UNCOMMON_IDS: SymbolId[] = [
  "fox","rabbit","honeybee","lantern","owl","foxglove","hedgehog","wild_rose","oak_leaf","crow",
];
/** Common ids — Green Man upgrades 3 of these when drafted. */
export const COMMON_IDS: SymbolId[] = [
  "firefly","fern","mushroom","acorn","dewdrop","moth","pebble","clover","sparrow","berry","dandelion","snail",
];

export interface SymbolDef {
  id: SymbolId;
  name: string;
  rarity: Rarity;
  emoji: string;
  /** Optional pixel art. Falls back to the emoji when missing. */
  sprite?: string;
  baseValue: number;
  tags: Tag[];
  synergies: Synergy[];
  /** Plain-language summary, joined from synergy descriptions for tooltips. */
  description: string;
}

function describe(synergies: Synergy[], baseValue: number): string {
  const lines = synergies.map((s) => s.description).filter(Boolean);
  if (lines.length === 0) return `+${baseValue} Light Orb${baseValue === 1 ? "" : "s"}.`;
  return `+${baseValue}. ` + lines.join(" ");
}

function def(input: Omit<SymbolDef, "description"> & { description?: string }): SymbolDef {
  return { ...input, description: input.description ?? describe(input.synergies, input.baseValue) };
}

export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  // ===== COMMONS =====
  firefly: def({
    id: "firefly", name: "Firefly", rarity: "common", emoji: "✨", sprite: fireflyImg,
    baseValue: 1, tags: ["nocturnal"],
    synergies: [
      { type: "adjacentBonus", targets: ["moth", "lantern"], bonus: 1, description: "+1 for each adjacent Moth or Lantern" },
    ],
  }),
  fern: def({
    id: "fern", name: "Fern", rarity: "common", emoji: "🌿", sprite: fernImg,
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "adjacentBonus", targets: ["forest_floor"], bonus: 1, description: "+1 for each adjacent Forest Floor" },
    ],
  }),
  mushroom: def({
    id: "mushroom", name: "Mushroom", rarity: "common", emoji: "🍄", sprite: mushroomAsset.url,
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "globalCountReward", targets: ["mushroom"], threshold: 3, reward: "bloom_shard", amount: 1, description: "3+ on grid: +1 Bloom Shard" },
    ],
  }),
  acorn: def({
    id: "acorn", name: "Acorn", rarity: "common", emoji: "🌰",
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "transform", transformInto: "oak_leaf", afterSpins: 5, description: "Transforms into Oak Leaf after appearing 5 times" },
    ],
  }),
  dewdrop: def({
    id: "dewdrop", name: "Dewdrop", rarity: "common", emoji: "💧",
    baseValue: 1, tags: ["flower"],
    synergies: [
      { type: "adjacentBonus", targets: ["flower"], bonus: 2, description: "+2 if adjacent to any Flower" },
    ],
  }),
  moth: def({
    id: "moth", name: "Moth", rarity: "common", emoji: "🦋", sprite: mothImg,
    baseValue: 2, tags: ["nocturnal"],
    synergies: [
      { type: "adjacentBonus", targets: ["firefly"], bonus: 1, description: "+1 for each adjacent Firefly" },
    ],
  }),
  pebble: def({
    id: "pebble", name: "Pebble", rarity: "common", emoji: "🪨",
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "note", description: "No effect alone. Part of Standing Stone synergy" },
    ],
  }),
  clover: def({
    id: "clover", name: "Clover", rarity: "common", emoji: "🍀", sprite: cloverImg,
    baseValue: 1, tags: [],
    synergies: [
      { type: "selfChance", chance: 0.10, multiplier: 2, description: "10% chance to double its own value" },
    ],
  }),
  sparrow: def({
    id: "sparrow", name: "Sparrow", rarity: "common", emoji: "🐦",
    baseValue: 1, tags: ["creature"],
    synergies: [
      { type: "globalBonus", targets: ["creature"], bonus: 1, description: "+1 for each other Creature on grid" },
    ],
  }),
  berry: def({
    id: "berry", name: "Berry", rarity: "common", emoji: "🫐",
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "adjacentBonus", targets: ["berry", "hedgehog"], bonus: 1, description: "+1 for each adjacent Berry or Hedgehog" },
    ],
  }),
  dandelion: def({
    id: "dandelion", name: "Dandelion", rarity: "common", emoji: "🌼", sprite: dandelionImg,
    baseValue: 1, tags: ["flower"],
    synergies: [
      { type: "periodicReward", every: 4, reward: "moon_token", amount: 1, description: "Produces 1 Moon Token every 4 spins" },
    ],
  }),
  snail: def({
    id: "snail", name: "Snail", rarity: "common", emoji: "🐌",
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "alternating", multiplier: 2, description: "Counts double every other spin" },
    ],
  }),

  // ===== UNCOMMONS =====
  fox: def({
    id: "fox", name: "Fox", rarity: "uncommon", emoji: "🦊", sprite: foxAsset.url,
    baseValue: 3, tags: ["creature"],
    synergies: [
      { type: "globalBonus", targets: ["rabbit"], bonus: 1, description: "+1 for each Rabbit on grid" },
      { type: "destroyAdjacent", targets: ["pebble"], bonus: 2, description: "Destroys adjacent Pebbles for +2 each (v2)" },
    ],
  }),
  rabbit: def({
    id: "rabbit", name: "Rabbit", rarity: "uncommon", emoji: "🐰", sprite: rabbitImg,
    baseValue: 2, tags: ["creature"],
    synergies: [
      { type: "conditionalBonus", absentTarget: "fox", bonus: 2, description: "+2 if no Fox on grid" },
      { type: "conditionalBonus", presentTarget: "fox", bonus: 1, description: "+1 if Fox is on grid (nervous energy)" },
    ],
  }),
  honeybee: def({
    id: "honeybee", name: "Honeybee", rarity: "uncommon", emoji: "🐝", sprite: honeybeeImg,
    baseValue: 3, tags: ["creature"],
    synergies: [
      { type: "adjacentBonus", targets: ["flower"], bonus: 2, description: "+2 for each adjacent Flower" },
    ],
  }),
  lantern: def({
    id: "lantern", name: "Lantern", rarity: "uncommon", emoji: "🏮", sprite: lanternImg,
    baseValue: 3, tags: ["nocturnal"],
    synergies: [
      { type: "adjacentBonus", targets: ["all"], bonus: 1, description: "+1 to all orthogonally adjacent symbols" },
      { type: "globalMultiplier", targets: ["firefly"], multiplier: 2, description: "Doubles all Fireflies on grid" },
    ],
  }),
  owl: def({
    id: "owl", name: "Owl", rarity: "uncommon", emoji: "🦉", sprite: owlImg,
    baseValue: 3, tags: ["creature", "nocturnal"],
    synergies: [
      { type: "roundBonus", roundType: "odd", targets: ["nocturnal"], bonus: 1, description: "+1 per Nocturnal on odd rounds" },
    ],
  }),
  foxglove: def({
    id: "foxglove", name: "Foxglove", rarity: "uncommon", emoji: "💜",
    baseValue: 2, tags: ["flower"],
    synergies: [
      { type: "adjacentBonus", targets: ["honeybee"], bonus: 2, description: "+2 for each adjacent Honeybee" },
      { type: "globalReward", requires: "beehive", reward: "bloom_shard", amount: 1, description: "+1 Bloom Shard if Beehive on grid" },
    ],
  }),
  oak_leaf: def({
    id: "oak_leaf", name: "Oak Leaf", rarity: "uncommon", emoji: "🍂",
    baseValue: 3, tags: ["forest_floor"],
    synergies: [
      { type: "adjacentBonus", targets: ["forest_floor"], bonus: 1, description: "+1 for each adjacent Forest Floor" },
      { type: "transform", transformInto: "ancient_oak", afterSpins: 8, description: "Becomes Ancient Oak after 8 spins (v2)" },
    ],
  }),
  crow: def({
    id: "crow", name: "Crow", rarity: "uncommon", emoji: "🐦‍⬛", sprite: crowImg,
    baseValue: 3, tags: ["creature", "nocturnal"],
    synergies: [
      { type: "runningTotal", tracks: "destroyed_symbols", bonus: 1, cap: 6, description: "+1 per symbol destroyed this run (max +6)" },
    ],
  }),
  hedgehog: def({
    id: "hedgehog", name: "Hedgehog", rarity: "uncommon", emoji: "🦔", sprite: hedgehogImg,
    baseValue: 2, tags: ["creature", "forest_floor"],
    synergies: [
      { type: "adjacentBonus", targets: ["berry"], bonus: 1, description: "+1 for each adjacent Berry" },
      { type: "passive", effect: "destruction_immune", description: "Immune to symbol destruction (v2)" },
    ],
  }),
  wild_rose: def({
    id: "wild_rose", name: "Wild Rose", rarity: "uncommon", emoji: "🌹",
    baseValue: 2, tags: ["flower"],
    synergies: [
      { type: "adjacentBonus", targets: ["flower"], bonus: 1, description: "+1 for each adjacent Flower" },
      { type: "adjacentBonus", targets: ["antler_crown"], bonus: 3, description: "+3 if adjacent to Antler Crown" },
    ],
  }),

  // ===== RARES =====
  beehive: def({
    id: "beehive", name: "Beehive", rarity: "rare", emoji: "🍯",
    baseValue: 5, tags: [],
    synergies: [
      { type: "globalBonus", targets: ["honeybee", "foxglove"], bonus: 1, description: "+1 per Honeybee or Foxglove on grid" },
      { type: "periodicSpawn", every: 3, spawns: "honey_jar", description: "Produces a Honey Jar every 3 spins (v2)" },
    ],
  }),
  antler_crown: def({
    id: "antler_crown", name: "Antler Crown", rarity: "rare", emoji: "👑", sprite: crownAsset.url,
    baseValue: 6, tags: [],
    synergies: [
      { type: "globalBonus", targets: ["creature"], bonus: 2, description: "All Creatures on grid +2" },
      { type: "sacrifice", reward: "light_orbs", amount: 5, description: "Sacrifice an adjacent symbol for +5 Orbs (v2)" },
    ],
  }),
  standing_stone: def({
    id: "standing_stone", name: "Standing Stone", rarity: "rare", emoji: "🗿",
    baseValue: 5, tags: [],
    synergies: [
      { type: "destroyBonus", targets: ["pebble"], bonus: 1, description: "+1 per Pebble destroyed this run (v2)" },
      { type: "multipleBonus", requires: 2, targets: ["standing_stone"], multiplier: 2, description: "Doubles own value if 2+ Standing Stones on grid" },
    ],
  }),
  sun_wheel: def({
    id: "sun_wheel", name: "Sun Wheel", rarity: "rare", emoji: "☀️",
    baseValue: 6, tags: [],
    synergies: [
      { type: "spinCounter", bonus: 1, description: "+1 for each spin survived this run" },
      { type: "titheReduction", amount: 0.10, description: "Reduces tithe pressure by 10% (v2)" },
    ],
  }),
  honey_jar: def({
    id: "honey_jar", name: "Honey Jar", rarity: "rare", emoji: "🫙",
    baseValue: 4, tags: [],
    synergies: [
      { type: "globalBonus", targets: ["flower", "honeybee"], bonus: 1, description: "+1 per Flower or Honeybee on grid" },
      { type: "consumeOnTithe", reward: "light_orbs", amount: 8, description: "Consumed for +8 Orbs at tithe (v2)" },
    ],
  }),
  glowing_wisp: def({
    id: "glowing_wisp", name: "Glowing Wisp", rarity: "rare", emoji: "🔮",
    baseValue: 5, tags: ["nocturnal"],
    synergies: [
      { type: "copyAdjacent", count: 1, priority: "highest", description: "Copies the highest-value adjacent symbol (v2)" },
    ],
  }),

  // ===== VERY RARE =====
  solstice_flame: def({
    id: "solstice_flame", name: "Solstice Flame", rarity: "very_rare", emoji: "🔥", sprite: flameAsset.url,
    baseValue: 10, tags: [],
    synergies: [
      { type: "globalBonus", targets: ["all"], bonus: 1, description: "All symbols +1" },
      { type: "exactTitheBonus", multiplier: 2, description: "Doubles Orbs if tithe exactly met (v2)" },
    ],
  }),
  green_man: def({
    id: "green_man", name: "The Green Man", rarity: "very_rare", emoji: "🌳",
    baseValue: 12, tags: [],
    synergies: [
      { type: "treatAsAdjacent", targets: ["forest_floor", "flower"], description: "Forest Floor & Flower count as adjacent grid-wide" },
      { type: "transformCommon", count: 3, transformInto: "uncommon", description: "Upgrades 3 random Commons in your pool to Uncommons on draft" },
    ],
  }),

  // ===== BONUS =====
  fairy_ring: def({
    id: "fairy_ring", name: "Fairy Ring", rarity: "rare", emoji: "⭕",
    baseValue: 5, tags: ["forest_floor"],
    synergies: [
      { type: "globalMultiplier", targets: ["forest_floor"], multiplier: 2, requires: 3, description: "If 3+ Forest Floor visible, doubles all their values" },
    ],
  }),
  moon_elixir: def({
    id: "moon_elixir", name: "Moon Elixir", rarity: "uncommon", emoji: "🧪",
    baseValue: 3, tags: [],
    synergies: [
      { type: "periodicReward", every: 1, reward: "bloom_shard", amount: 1, description: "Gives 1 Bloom Shard per spin" },
      { type: "adjacentBonus", targets: ["glowing_wisp"], bonus: 3, description: "+3 if adjacent to Glowing Wisp" },
    ],
  }),
  rowan_wand: def({
    id: "rowan_wand", name: "Rowan Wand", rarity: "uncommon", emoji: "🪄",
    baseValue: 3, tags: [],
    synergies: [
      { type: "adjacentBonus", targets: ["flower", "nocturnal"], bonus: 2, description: "+2 per adjacent Flower or Nocturnal" },
    ],
  }),
  fae_wings: def({
    id: "fae_wings", name: "Fae Wings", rarity: "uncommon", emoji: "🪽",
    baseValue: 2, tags: ["nocturnal"],
    synergies: [
      { type: "globalBonus", targets: ["nocturnal"], bonus: 1, description: "+1 per other Nocturnal on grid" },
      { type: "passive", effect: "can_move", description: "Shifts position each spin (v2)" },
    ],
  }),

  // ===== v2 transform target (placeholder so SymbolId stays exhaustive) =====
  ancient_oak: def({
    id: "ancient_oak", name: "Ancient Oak", rarity: "very_rare", emoji: "🌳",
    baseValue: 8, tags: ["forest_floor"],
    synergies: [
      { type: "globalBonus", targets: ["forest_floor"], bonus: 1, description: "+1 per Forest Floor on grid" },
    ],
  }),
};

/** The bag the player starts with — 5 exact tile instances. */
export const STARTING_POOL: SymbolId[] = [
  "firefly",
  "firefly",
  "firefly",
  "fern",
  "mushroom",
];

/** Symbols offered in the draft. Excludes starters, transform-only, very_rare. */
export const DRAFT_POOL: SymbolId[] = [
  // commons (non-starter)
  "acorn", "dewdrop", "moth", "pebble", "clover", "sparrow", "berry", "dandelion", "snail",
  // uncommons
  "fox", "rabbit", "honeybee", "lantern", "owl", "foxglove", "oak_leaf", "crow", "hedgehog", "wild_rose",
  // rares
  "beehive", "antler_crown", "standing_stone", "sun_wheel", "honey_jar", "glowing_wisp",
  // bonus
  "fairy_ring", "moon_elixir", "rowan_wand", "fae_wings",
];

/** Resolve whether `target` matches a given symbol id (or "all"). */
export function symbolMatches(target: SynergyTarget, id: SymbolId): boolean {
  if (target === "all") return true;
  if (target === id) return true;
  const def = SYMBOLS[id];
  return def.tags.includes(target as Tag);
}
