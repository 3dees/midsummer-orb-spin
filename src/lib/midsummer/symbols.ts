// Midsummer Slots — symbol registry.
//
// The full roster is data-driven: each symbol declares its `synergies[]`,
// and the engine walks those at scoring time. Adding a new symbol is just
// data — no engine changes needed for any of the supported synergy types.

// -----------------------------------------------------------------------
// Sprite imports — all keyed to filenames in spritesheet_by_rarity.json
// -----------------------------------------------------------------------

// Commons
import acornImg        from "@/assets/sprites/acorn.png";
import babysBreathImg  from "@/assets/sprites/babys_breath.png";
import berryImg        from "@/assets/sprites/berry.png";
import cloverImg       from "@/assets/sprites/clover.png";
import dandelionImg    from "@/assets/sprites/dandelion.png";
import dewdropImg      from "@/assets/sprites/dewdrop.png";
import fairyCloudImg   from "@/assets/sprites/fairy_cloud.png";
import fernImg         from "@/assets/sprites/fern.png";
import fireflyImg      from "@/assets/sprites/firefly.png";
import mothImg         from "@/assets/sprites/moth.png";
import mushroomImg     from "@/assets/sprites/mushroom.png";
import pebbleImg       from "@/assets/sprites/pebble.png";
import snailImg        from "@/assets/sprites/snail.png";
import sparrowImg      from "@/assets/sprites/sparrow.png";
import sunbeamImg      from "@/assets/sprites/sunbeam.png";

// Uncommons
import bonfireImg      from "@/assets/sprites/bonfire.png";
import crowImg         from "@/assets/sprites/crow.png";
import elixirImg       from "@/assets/sprites/elixir.png";
import fairyWingsImg   from "@/assets/sprites/fairy_wings.png";
import foxImg          from "@/assets/sprites/fox.png";
import foxgloveImg     from "@/assets/sprites/foxglove.png";
import hedgehogImg     from "@/assets/sprites/hedgehog.png";
import honeybeeImg     from "@/assets/sprites/honeybee.png";
import lanternImg      from "@/assets/sprites/lantern.png";
import leafImg         from "@/assets/sprites/leaf.png";
import owlImg          from "@/assets/sprites/owl.png";
import rabbitImg       from "@/assets/sprites/rabbit.png";
import sundewImg       from "@/assets/sprites/sundew.png";
import wandImg         from "@/assets/sprites/wand.png";
import wildRoseImg     from "@/assets/sprites/wild_rose.png";

// Rares
import beehiveImg      from "@/assets/sprites/beehive.png";
import crownImg        from "@/assets/sprites/crown.png";
import goldenStagImg   from "@/assets/sprites/golden_stag.png";
import honeyJarImg     from "@/assets/sprites/honey_jar.png";
import mayQueenImg     from "@/assets/sprites/may_queen_crown.png";
import mushringImg     from "@/assets/sprites/mushring.png";
import solsticeDiscImg from "@/assets/sprites/solstice_disc.png";
import standingStoneImg from "@/assets/sprites/standing_stone.png";
import wispImg         from "@/assets/sprites/wisp.png";

// Very Rare
import flameImg        from "@/assets/sprites/flame.png";
import greenManImg     from "@/assets/sprites/green_man.png";
import treeImg         from "@/assets/sprites/tree.png";

// Easter Eggs
import cornDollyImg    from "@/assets/sprites/corn_dolly.png";
import othalaRuneImg   from "@/assets/sprites/othala_rune.png";

// -----------------------------------------------------------------------

export type Rarity = "common" | "uncommon" | "rare" | "very_rare";

export type Tag = "forest_floor" | "flower" | "creature" | "nocturnal" | "solar";

export type Reward = "light_orbs" | "reroll_orb" | "removal_orb";

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
  | { type: "roundPenalty"; roundType: "odd" | "even"; multiplier: number; description: string }
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
  | { type: "stealAdjacent"; description: string }
  | { type: "passive"; effect: string; description: string }
  | { type: "note"; description: string };

export type SymbolId =
  // commons
  | "firefly" | "fern" | "mushroom" | "acorn" | "dewdrop" | "moth"
  | "pebble" | "clover" | "sparrow" | "berry" | "dandelion" | "snail"
  | "sunbeam" | "babys_breath" | "fairy_cloud"
  // uncommons
  | "fox" | "rabbit" | "honeybee" | "lantern" | "owl" | "foxglove"
  | "oak_leaf" | "crow" | "hedgehog" | "wild_rose" | "moon_elixir"
  | "rowan_wand" | "fae_wings" | "sundew" | "bonfire"
  // rares
  | "beehive" | "antler_crown" | "standing_stone"
  | "honey_jar" | "glowing_wisp" | "fairy_ring" | "golden_stag"
  | "solstice_coin" | "may_queen_crown"
  // very rare
  | "solstice_flame" | "green_man"
  // easter eggs
  | "corn_dolly" | "othala_rune"
  // v2 transform targets (not draftable)
  | "ancient_oak";

// ===== Named synergy groups =====
export const SYNERGY_GROUPS = {
  nocturnal_web:   { name: "Nocturnal Web",       members: ["moth","firefly","owl","lantern","fae_wings"] as SymbolId[] },
  forest_floor:    { name: "Forest Floor",        members: ["mushroom","fern","snail","hedgehog","pebble","fairy_ring","acorn","oak_leaf","berry","ancient_oak"] as SymbolId[] },
  pollinator:      { name: "Pollinator Chain",    members: ["honeybee","foxglove","beehive","honey_jar"] as SymbolId[] },
  predator_prey:   { name: "Predator & Prey",     members: ["fox","rabbit"] as SymbolId[] },
  ancient_circle:  { name: "Ancient Circle",      members: ["standing_stone","antler_crown"] as SymbolId[] },
  wild_garden:     { name: "Wild Garden",         members: ["wild_rose","foxglove","dewdrop","dandelion","babys_breath"] as SymbolId[] },
  murder_of_crows: { name: "Murder of Crows",     members: ["crow"] as SymbolId[] },
  green_blessing:  { name: "Green Man Blessing",  members: ["green_man","fern","mushroom","acorn","oak_leaf","dewdrop","foxglove","wild_rose","dandelion","babys_breath","sundew"] as SymbolId[] },
  last_light:      { name: "Last Light",          members: ["golden_stag","sundew","sunbeam","bonfire","solstice_coin"] as SymbolId[] },
} as const;
export type SynergyGroupId = keyof typeof SYNERGY_GROUPS;

export function groupsForSymbol(id: SymbolId): SynergyGroupId[] {
  const out: SynergyGroupId[] = [];
  for (const key of Object.keys(SYNERGY_GROUPS) as SynergyGroupId[]) {
    if (SYNERGY_GROUPS[key].members.includes(id)) out.push(key);
  }
  return out;
}

export const UNCOMMON_IDS: SymbolId[] = [
  "fox","rabbit","honeybee","lantern","owl","foxglove","hedgehog","wild_rose","oak_leaf","crow","moon_elixir","rowan_wand","fae_wings","sundew","bonfire",
];
export const COMMON_IDS: SymbolId[] = [
  "firefly","fern","mushroom","acorn","dewdrop","moth","pebble","clover","sparrow","berry","dandelion","snail","sunbeam","babys_breath","fairy_cloud",
];

export interface SymbolDef {
  id: SymbolId;
  name: string;
  rarity: Rarity;
  emoji: string;
  sprite?: string;
  baseValue: number;
  tags: Tag[];
  synergies: Synergy[];
  description: string;
  easterEgg?: boolean;
  draftable?: boolean;
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

  // ================================================================
  // COMMONS
  // ================================================================

  firefly: def({
    id: "firefly", name: "Firefly", rarity: "common", emoji: "✨", sprite: fireflyImg,
    baseValue: 1, tags: ["nocturnal"],
    synergies: [
      { type: "adjacentBonus", targets: ["moth", "lantern"], bonus: 2, description: "+2 for each adjacent Moth or Lantern" },
    ],
  }),

  fern: def({
    id: "fern", name: "Fern", rarity: "common", emoji: "🌿", sprite: fernImg,
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "adjacentBonus", targets: ["forest_floor"], bonus: 2, description: "+2 for each adjacent Forest Floor symbol" },
    ],
  }),

  mushroom: def({
    id: "mushroom", name: "Mushroom", rarity: "common", emoji: "🍄", sprite: mushroomImg,
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "globalCountReward", targets: ["mushroom"], threshold: 3, reward: "reroll_orb", amount: 1, description: "3+ on grid: +1 Reroll Orb" },
    ],
  }),

  acorn: def({
    id: "acorn", name: "Acorn", rarity: "common", emoji: "🌰", sprite: acornImg,
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "transform", transformInto: "oak_leaf", afterSpins: 5, description: "Transforms into Oak Leaf after appearing 5 times" },
    ],
  }),

  dewdrop: def({
    id: "dewdrop", name: "Dewdrop", rarity: "common", emoji: "💧", sprite: dewdropImg,
    baseValue: 1, tags: ["flower"],
    synergies: [
      { type: "adjacentBonus", targets: ["flower"], bonus: 4, description: "+4 if adjacent to any Flower symbol" },
    ],
  }),

  moth: def({
    id: "moth", name: "Moth", rarity: "common", emoji: "🦋", sprite: mothImg,
    baseValue: 2, tags: ["nocturnal"],
    synergies: [
      { type: "adjacentBonus", targets: ["firefly"], bonus: 2, description: "+2 for each adjacent Firefly" },
    ],
  }),

  pebble: def({
    id: "pebble", name: "Pebble", rarity: "common", emoji: "🪨", sprite: pebbleImg,
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "note", description: "No effect alone. Part of Standing Stone synergy. Destroyed by Fox for +2" },
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
    id: "sparrow", name: "Sparrow", rarity: "common", emoji: "🐦", sprite: sparrowImg,
    baseValue: 1, tags: ["creature"],
    synergies: [
      { type: "globalBonus", targets: ["creature"], bonus: 1, description: "+1 for each other Creature on grid" },
    ],
  }),

  berry: def({
    id: "berry", name: "Berry", rarity: "common", emoji: "🫐", sprite: berryImg,
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "adjacentBonus", targets: ["berry", "hedgehog"], bonus: 2, description: "+2 for each adjacent Berry or Hedgehog" },
    ],
  }),

  dandelion: def({
    id: "dandelion", name: "Dandelion", rarity: "common", emoji: "🌼", sprite: dandelionImg,
    baseValue: 1, tags: ["flower"],
    synergies: [
      { type: "periodicReward", every: 4, reward: "reroll_orb", amount: 1, description: "Produces 1 Reroll Orb every 4 spins" },
    ],
  }),

  snail: def({
    id: "snail", name: "Snail", rarity: "common", emoji: "🐌", sprite: snailImg,
    baseValue: 1, tags: ["forest_floor"],
    synergies: [
      { type: "alternating", multiplier: 2, description: "Counts double every other spin" },
    ],
  }),

  sunbeam: def({
    id: "sunbeam", name: "Sunbeam", rarity: "common", emoji: "🌤️", sprite: sunbeamImg,
    baseValue: 2, tags: ["solar"],
    synergies: [
      { type: "globalBonus", targets: ["solar"], bonus: 1, description: "+1 for each other Solar symbol on grid" },
      { type: "roundPenalty", roundType: "odd", multiplier: 0.5, description: "Value halved on odd rounds — the light is fading" },
    ],
  }),

  babys_breath: def({
    id: "babys_breath", name: "Baby's Breath", rarity: "common", emoji: "🤍", sprite: babysBreathImg,
    baseValue: 1, tags: ["flower"],
    synergies: [
      { type: "adjacentBonus", targets: ["flower"], bonus: 2, description: "+2 for each adjacent Flower symbol" },
      { type: "adjacentBonus", targets: ["dewdrop"], bonus: 4, description: "+4 if adjacent to Dewdrop" },
    ],
  }),

  fairy_cloud: def({
    id: "fairy_cloud", name: "Fairy Cloud", rarity: "common", emoji: "☁️", sprite: fairyCloudImg,
    baseValue: 1, tags: [],
    synergies: [
      { type: "adjacentBonus", targets: ["nocturnal", "fae_wings"], bonus: 2, description: "+2 for each adjacent Nocturnal or Fae Wings symbol" },
      { type: "passive", effect: "row_adjacent", description: "Counts as adjacent to all symbols in same row (v2)" },
    ],
  }),

  // ================================================================
  // UNCOMMONS
  // ================================================================

  fox: def({
    id: "fox", name: "Fox", rarity: "uncommon", emoji: "🦊", sprite: foxImg,
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
      { type: "adjacentBonus", targets: ["flower"], bonus: 4, description: "+4 for each adjacent Flower symbol" },
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
      { type: "roundBonus", roundType: "odd", targets: ["nocturnal"], bonus: 1, description: "+1 per Nocturnal symbol on odd rounds" },
    ],
  }),

  foxglove: def({
    id: "foxglove", name: "Foxglove", rarity: "uncommon", emoji: "💜", sprite: foxgloveImg,
    baseValue: 2, tags: ["flower"],
    synergies: [
      { type: "adjacentBonus", targets: ["honeybee"], bonus: 4, description: "+4 for each adjacent Honeybee" },
      { type: "globalReward", requires: "beehive", reward: "reroll_orb", amount: 1, description: "+1 Reroll Orb if Beehive is on grid" },
    ],
  }),

  oak_leaf: def({
    id: "oak_leaf", name: "Oak Leaf", rarity: "uncommon", emoji: "🍂", sprite: leafImg,
    baseValue: 3, tags: ["forest_floor"],
    synergies: [
      { type: "adjacentBonus", targets: ["forest_floor"], bonus: 2, description: "+2 for each adjacent Forest Floor symbol" },
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
      { type: "adjacentBonus", targets: ["berry"], bonus: 2, description: "+2 for each adjacent Berry" },
      { type: "passive", effect: "destruction_immune", description: "Immune to symbol destruction (v2)" },
    ],
  }),

  wild_rose: def({
    id: "wild_rose", name: "Wild Rose", rarity: "uncommon", emoji: "🌹", sprite: wildRoseImg,
    baseValue: 2, tags: ["flower"],
    synergies: [
      { type: "adjacentBonus", targets: ["flower"], bonus: 2, description: "+2 for each adjacent Flower symbol" },
      { type: "adjacentBonus", targets: ["antler_crown"], bonus: 6, description: "+6 if adjacent to Antler Crown" },
    ],
  }),

  moon_elixir: def({
    id: "moon_elixir", name: "Moon Elixir", rarity: "uncommon", emoji: "🧪", sprite: elixirImg,
    baseValue: 3, tags: [],
    synergies: [
      { type: "periodicReward", every: 1, reward: "reroll_orb", amount: 1, description: "Gives 1 Reroll Orb per spin" },
      { type: "adjacentBonus", targets: ["glowing_wisp"], bonus: 6, description: "+6 if adjacent to Glowing Wisp" },
    ],
  }),

  rowan_wand: def({
    id: "rowan_wand", name: "Rowan Wand", rarity: "uncommon", emoji: "🪄", sprite: wandImg,
    baseValue: 3, tags: [],
    synergies: [
      { type: "adjacentBonus", targets: ["flower", "nocturnal"], bonus: 4, description: "+4 per adjacent Flower or Nocturnal symbol" },
    ],
  }),

  fae_wings: def({
    id: "fae_wings", name: "Fae Wings", rarity: "uncommon", emoji: "🪽", sprite: fairyWingsImg,
    baseValue: 2, tags: ["nocturnal"],
    synergies: [
      { type: "globalBonus", targets: ["nocturnal"], bonus: 1, description: "+1 per other Nocturnal symbol on grid" },
      { type: "passive", effect: "can_move", description: "Shifts position each spin (v2)" },
    ],
  }),

  sundew: def({
    id: "sundew", name: "Sundew", rarity: "uncommon", emoji: "🌱", sprite: sundewImg,
    baseValue: 3, tags: ["flower", "solar"],
    synergies: [
      { type: "adjacentBonus", targets: ["flower"], bonus: 2, description: "+2 for each adjacent Flower symbol" },
      { type: "destroyAdjacent", targets: ["creature"], bonus: 4, description: "Consumes an adjacent Creature for +4 Orbs (v2)" },
    ],
  }),

  bonfire: def({
    id: "bonfire", name: "Bonfire", rarity: "uncommon", emoji: "🪵", sprite: bonfireImg,
    baseValue: 3, tags: ["solar"],
    synergies: [
      { type: "globalBonus", targets: ["nocturnal"], bonus: 1, description: "+1 for each Nocturnal symbol on grid. Nocturnals are drawn to the flame" },
    ],
  }),

  // ================================================================
  // RARES
  // ================================================================

  beehive: def({
    id: "beehive", name: "Beehive", rarity: "rare", emoji: "🍯", sprite: beehiveImg,
    baseValue: 5, tags: [],
    synergies: [
      { type: "globalBonus", targets: ["honeybee", "foxglove"], bonus: 1, description: "+1 per Honeybee or Foxglove on grid" },
      { type: "periodicSpawn", every: 3, spawns: "honey_jar", description: "Produces a Honey Jar every 3 spins (v2)" },
    ],
  }),

  antler_crown: def({
    id: "antler_crown", name: "Antler Crown", rarity: "rare", emoji: "👑", sprite: crownImg,
    baseValue: 6, tags: [],
    synergies: [
      { type: "globalBonus", targets: ["creature"], bonus: 2, description: "All Creature symbols on grid +2" },
      { type: "sacrifice", reward: "light_orbs", amount: 5, description: "Sacrifice an adjacent symbol for +5 Light Orbs (v2)" },
    ],
  }),

  standing_stone: def({
    id: "standing_stone", name: "Standing Stone", rarity: "rare", emoji: "🗿", sprite: standingStoneImg,
    baseValue: 5, tags: [],
    synergies: [
      { type: "destroyBonus", targets: ["pebble"], bonus: 1, description: "+1 per Pebble destroyed this run (v2)" },
      { type: "multipleBonus", requires: 2, targets: ["standing_stone"], multiplier: 2, description: "Doubles own value if 2+ Standing Stones on grid" },
    ],
  }),

  honey_jar: def({
    id: "honey_jar", name: "Honey Jar", rarity: "rare", emoji: "🫙", sprite: honeyJarImg,
    baseValue: 4, tags: [],
    synergies: [
      { type: "globalBonus", targets: ["flower", "honeybee"], bonus: 1, description: "+1 per Flower or Honeybee on grid" },
      { type: "consumeOnTithe", reward: "light_orbs", amount: 8, description: "Consumed for +8 Light Orbs at tithe (v2)" },
    ],
  }),

  glowing_wisp: def({
    id: "glowing_wisp", name: "Glowing Wisp", rarity: "rare", emoji: "🔮", sprite: wispImg,
    baseValue: 5, tags: ["nocturnal"],
    synergies: [
      { type: "copyAdjacent", count: 1, priority: "highest", description: "Copies the highest-value adjacent symbol (v2)" },
    ],
  }),

  fairy_ring: def({
    id: "fairy_ring", name: "Fairy Ring", rarity: "rare", emoji: "⭕", sprite: mushringImg,
    baseValue: 5, tags: ["forest_floor"],
    synergies: [
      { type: "globalMultiplier", targets: ["forest_floor"], multiplier: 2, requires: 3, description: "If 3+ Forest Floor symbols visible, doubles all their values" },
    ],
  }),

  golden_stag: def({
    id: "golden_stag", name: "Golden Stag", rarity: "rare", emoji: "🦌", sprite: goldenStagImg,
    baseValue: 6, tags: ["creature", "solar"],
    synergies: [
      { type: "globalBonus", targets: ["solar"], bonus: 2, description: "+2 for each other Solar symbol on grid" },
      { type: "globalBonus", targets: ["creature"], bonus: 1, description: "All other Creature symbols +1 while present" },
    ],
  }),

  solstice_coin: def({
    id: "solstice_coin", name: "Solstice Coin", rarity: "rare", emoji: "🪙", sprite: solsticeDiscImg,
    baseValue: 4, tags: ["solar"],
    synergies: [
      { type: "periodicReward", every: 3, reward: "removal_orb", amount: 1, description: "Produces 1 Removal Orb every 3 spins" },
      { type: "globalBonus", targets: ["solar"], bonus: 1, description: "+1 for each other Solar symbol on grid" },
    ],
  }),

  may_queen_crown: def({
    id: "may_queen_crown", name: "May Queen Crown", rarity: "rare", emoji: "🌸", sprite: mayQueenImg,
    baseValue: 5, tags: ["flower"],
    easterEgg: true,
    synergies: [
      { type: "globalBonus", targets: ["flower"], bonus: 2, description: "All Flower symbols +2" },
      { type: "passive", effect: "tithe_tie_wins", description: "If orbs exactly meet tithe, counts as +5 bonus orbs" },
    ],
  }),

  // ================================================================
  // VERY RARE
  // ================================================================

  solstice_flame: def({
    id: "solstice_flame", name: "Solstice Flame", rarity: "very_rare", emoji: "🔥", sprite: flameImg,
    baseValue: 10, tags: [],
    synergies: [
      { type: "globalBonus", targets: ["all"], bonus: 1, description: "All symbols +1" },
      { type: "exactTitheBonus", multiplier: 2, description: "Doubles Light Orbs earned if tithe is exactly met (v2)" },
    ],
  }),

  green_man: def({
    id: "green_man", name: "The Green Man", rarity: "very_rare", emoji: "🌳", sprite: greenManImg,
    baseValue: 12, tags: [],
    synergies: [
      { type: "treatAsAdjacent", targets: ["forest_floor", "flower"], description: "Forest Floor & Flower symbols count as adjacent to each other grid-wide" },
      { type: "transformCommon", count: 3, transformInto: "uncommon", description: "Upgrades 3 random Commons in your pool to Uncommons on draft" },
    ],
  }),

  // ================================================================
  // EASTER EGGS
  // ================================================================

  corn_dolly: def({
    id: "corn_dolly", name: "Corn Dolly", rarity: "rare", emoji: "🌾", sprite: cornDollyImg,
    baseValue: 4, tags: [],
    easterEgg: true,
    synergies: [
      { type: "stealAdjacent", description: "Absorbs the value of one random adjacent symbol. That symbol scores 0 this spin (v2)" },
      { type: "passive", effect: "folk_curse", description: "Something is wrong here" },
    ],
  }),

  othala_rune: def({
    id: "othala_rune", name: "Othala Rune", rarity: "uncommon", emoji: "⧖", sprite: othalaRuneImg,
    baseValue: 3, tags: [],
    easterEgg: true,
    synergies: [
      { type: "spinCounter", bonus: 1, description: "+1 for each spin this symbol has been in your pool (max +8)" },
    ],
  }),

  // ================================================================
  // V2 TRANSFORM TARGETS (not draftable)
  // ================================================================

  ancient_oak: def({
    id: "ancient_oak", name: "Ancient Oak", rarity: "very_rare", emoji: "🌲", sprite: treeImg,
    baseValue: 8, tags: ["forest_floor"],
    draftable: false,
    synergies: [
      { type: "globalBonus", targets: ["forest_floor"], bonus: 1, description: "+1 per Forest Floor symbol on grid" },
    ],
  }),
};

/** The bag the player starts with — 5 exact tile instances. */
export const STARTING_POOL: SymbolId[] = [
  "firefly",
  "fern",
  "mushroom",
  "dewdrop",
  "sparrow",
];

/** Symbols offered in the draft. Excludes starters, transform-only, easter eggs, very_rare. */
export const DRAFT_POOL: SymbolId[] = [
  // commons (non-starter)
  "acorn", "dewdrop", "moth", "pebble", "clover", "sparrow", "berry",
  "dandelion", "snail", "sunbeam", "babys_breath", "fairy_cloud",
  // uncommons
  "fox", "rabbit", "honeybee", "lantern", "owl", "foxglove", "oak_leaf",
  "crow", "hedgehog", "wild_rose", "moon_elixir", "rowan_wand", "fae_wings",
  "sundew", "bonfire",
  // rares
  "beehive", "antler_crown", "standing_stone", "honey_jar", "glowing_wisp",
  "fairy_ring", "golden_stag", "solstice_coin",
];

/** Resolve whether `target` matches a given symbol id (or "all"). */
export function symbolMatches(target: SynergyTarget, id: SymbolId): boolean {
  if (target === "all") return true;
  if (target === id) return true;
  const d = SYMBOLS[id];
  return d.tags.includes(target as Tag);
}
