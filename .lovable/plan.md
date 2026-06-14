# Plan

Four scoped changes to `src/lib/midsummer/{symbols,engine}.ts`, `src/routes/play.tsx`, `src/styles.css`. No new deps.

## 1. Synergy groups + tooltips

Add a named-group registry in `symbols.ts`:

```ts
export const SYNERGY_GROUPS = {
  nocturnal_web:   { name: "Nocturnal Web",   members: ["moth","firefly","owl","lantern","fae_wings"] },
  forest_floor:    { name: "Forest Floor",    members: ["mushroom","fern","snail","hedgehog","pebble","fairy_ring","acorn","oak_leaf","berry"] },
  pollinator:      { name: "Pollinator Chain",members: ["honeybee","foxglove","beehive","honey_jar"] },
  predator_prey:   { name: "Predator & Prey", members: ["fox","rabbit"] },
  ancient_circle:  { name: "Ancient Circle",  members: ["standing_stone","sun_wheel","antler_crown"] },
  wild_garden:     { name: "Wild Garden",     members: ["wild_rose","foxglove","dewdrop","dandelion"] },
  murder_of_crows: { name: "Murder of Crows", members: ["crow"] },
  green_blessing:  { name: "Green Man Blessing", members: ["green_man","fern","mushroom","acorn","oak_leaf","dewdrop","foxglove","wild_rose","dandelion"] },
} as const;
export type SynergyGroupId = keyof typeof SYNERGY_GROUPS;
export function groupsForSymbol(id: SymbolId): SynergyGroupId[];
```

Wrap every grid cell and pool-modal chip in a Radix `HoverCard` (already available) that also opens on tap (`onPointerDown` toggle for touch). Tooltip body: sprite/emoji, name, rarity pill, base value, `description`, then group chips. Clicking a chip sets a `highlightedGroup` state — cells whose id is in that group get a `.cell-grouped` outline class; pool chips get the same treatment. Click anywhere/Esc clears it.

## 2. Post-spin synergy breakdown panel

Extend `ScoreResult` with an event log:

```ts
type SpinEvent =
  | { kind: "base"; cell: number; id: SymbolId; orbs: number }
  | { kind: "synergy"; cell: number; id: SymbolId; synergyType: Synergy["type"];
      description: string; orbsDelta?: number; multiplierDelta?: number;
      rewardKind?: Reward; rewardAmount?: number; group?: SynergyGroupId };
export interface ScoreResult { …; events: SpinEvent[]; finalPerCell: number[]; }
```

`scoreGrid` pushes one event each time it mutates `perCell`, `multCell`, or `rewards`. Group event by source symbol for display.

UI: collapsible side panel `<SpinLog>` mounted right of the slot frame on desktop (≥900px), below the grid on mobile. Header: `Last spin: +N orbs`. Body: list grouped by symbol with delta values (`+2`, `×2`, `+1 ◆`). Empty state before first spin. Clears at `BEGIN_SPIN`; populated at `RESOLVE_SPIN`.

## 3. Acorn → Oak Leaf after 5 spins

Convert `playerPool: SymbolId[]` to per-instance tiles so each acorn ages independently:

```ts
interface PoolTile { uid: string; id: SymbolId; age: number; }
```

- `rollGrid` accepts `PoolTile[]`, returns `(PoolTile|null)[]` so cell rendering can read `tile.id` and the engine can mutate `tile.age` for tiles that landed.
- After `scoreGrid` resolves: for each tile on the grid, `age++`. If `tile.id === "acorn" && tile.age >= 5` → replace with a fresh `oak_leaf` tile (age 0). Emit a `SpinEvent` `{kind:"transform"}` so the log shows "Acorn → Oak Leaf".
- HUD pool count, draft adder, and pool modal switch to using tiles. `poolCounts` aggregates by `id`.
- Tooltip on Acorn shows `Transforms in X spins` using `5 - age` (min across instances if multiple).

## 4. Green Man activation

Implement the two v2 synergies for `green_man` only:

- `treatAsAdjacent`: during scoring, if Green Man is on the grid, any `adjacentBonus` whose targets include `forest_floor` or `flower` also counts every *global* tile with that tag, not just orthogonal neighbours. Implementation: in the `adjacentBonus` branch, when `gridHas(grid, "green_man")` and the synergy targets intersect `["forest_floor","flower"]`, replace the neighbour loop with a grid-wide scan for matching tags. Log the bonus events tagged `group: "green_blessing"` so the breakdown shows the boost is from Green Man.
- `transformCommon`: fires once on draft-pick of Green Man (not every spin). When `PICK_DRAFT` adds `green_man`, pick up to 3 random Common tiles in the current pool and upgrade them to a random Uncommon (`fox`, `rabbit`, `honeybee`, `lantern`, `owl`, `foxglove`, `hedgehog`, `wild_rose`, `oak_leaf`, `crow`). Show a one-time toast/overlay listing the upgrades.

Remove the "(v2)" suffix from both descriptions. Add a `greenManActive` derived flag for tooltip copy on affected symbols ("Counts grid-wide while Green Man is present").

## Files touched

- `src/lib/midsummer/symbols.ts` — group registry, `groupsForSymbol`, drop v2 tags on Green Man + Acorn descriptions.
- `src/lib/midsummer/engine.ts` — `SpinEvent` log, `PoolTile` signatures, Acorn aging/transform, Green Man `treatAsAdjacent`.
- `src/routes/play.tsx` — pool as `PoolTile[]`, `SpinLog` panel, tooltip/highlight state, Green Man upgrade flow on draft pick.
- `src/styles.css` — `.cell-grouped`, `.spin-log`, tooltip layout, responsive side-panel rules.

## Out of scope (still v2)

Other v2 synergies (`destroyAdjacent`, `sacrifice`, `periodicSpawn`, `consumeOnTithe`, `copyAdjacent`, `passive`, `titheReduction`, `exactTitheBonus`, `oak_leaf → ancient_oak` after 8 spins). Tooltips will still describe them so players see what's coming.
