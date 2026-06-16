import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";

import backgroundAsset from "@/assets/background.png.asset.json";
import crownImg from "@/assets/sprites/crown.png";
import orbImg from "@/assets/sprites/orb.png";
import cabinetImg from "@/assets/cabinet_clean.png";

import {
  DRAFT_POOL,
  STARTING_POOL,
  SYMBOLS,
  SYNERGY_GROUPS,
  COMMON_IDS,
  UNCOMMON_IDS,
  groupsForSymbol,
  type SymbolId,
  type SynergyGroupId,
  type SymbolDef,
} from "@/lib/midsummer/symbols";
import {
  GRID_COLS,
  GRID_SIZE,
  REMOVAL_ORB_CAP,
  TITHE_SCHEDULE,
  type PoolTile,
  type SpinEvent,
  makeTile,
  pickDraft,
  poolCounts,
  rollGrid,
  scoreGrid,
} from "@/lib/midsummer/engine";
import { FEATURES } from "@/lib/midsummer/features";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Midsummer Slots" },
      { name: "description", content: "A roguelite slot machine in a midsummer night forest." },
    ],
  }),
  component: PlayPage,
});

// -------- State ------------------------------------------------------------

type Phase =
  | { kind: "idle" }
  | { kind: "spinning" }
  | { kind: "tithe-passed"; round: number }
  | { kind: "tithe-failed"; round: number; orbs: number; required: number }
  | { kind: "draft"; offers: SymbolId[] }
  | { kind: "green-man-upgrade"; from: SymbolId[]; to: SymbolId[] }
  | { kind: "win" }
  | { kind: "loss" };

interface GameState {
  orbs: number; // banked towards tithe
  rerollOrbs: number;
  removalOrbs: number;
  pool: PoolTile[];
  /** Stub for the future — gated by FEATURES.items. */
  items: unknown[];
  /** Stub for the future — gated by FEATURES.essences. */
  essences: unknown[];
  grid: (PoolTile | null)[];
  spinInCycle: number; // 0..TITHE_SCHEDULE[titheRound].spins
  titheRound: number; // 0..TITHE_SCHEDULE.length
  totalSpins: number;
  alternatingTick: boolean;
  destroyedThisRun: number;
  appearanceCounts: Record<string, number>;
  lastScore: number;
  lastRewards: { rerollOrbs: number; removalOrbs: number };
  lastEvents: SpinEvent[];
  lastPerCell: number[];
  contributingCells: Set<number>;
  phase: Phase;
  lastDraft: { offers: SymbolId[]; picked: SymbolId | null } | null;
}

function initialState(): GameState {
  const pool = STARTING_POOL.map((id) => makeTile(id));
  return {
    orbs: 0,
    rerollOrbs: 0,
    removalOrbs: 0,
    pool,
    items: [],
    essences: [],
    grid: rollGrid(pool),
    spinInCycle: 0,
    titheRound: 0,
    totalSpins: 0,
    alternatingTick: false,
    destroyedThisRun: 0,
    appearanceCounts: {},
    lastScore: 0,
    lastRewards: { rerollOrbs: 0, removalOrbs: 0 },
    lastEvents: [],
    lastPerCell: [],
    contributingCells: new Set(),
    phase: { kind: "idle" },
    lastDraft: null,
  };
}

function cardBodyText(def: SymbolDef): string {
  const d = def.description;
  const m = d.match(/^\+(\d+)\.\s+(.*)$/);
  if (m) return m[2];
  if (/^\+(\d+) Light Orbs?\.$/.test(d)) return "";
  return d;
}

type Action =
  | { type: "BEGIN_SPIN" }
  | { type: "RESOLVE_SPIN" }
  | { type: "ACK_TITHE_PASS" }
  | { type: "PICK_DRAFT"; id: SymbolId }
  | { type: "REROLL_DRAFT" }
  | { type: "SKIP_DRAFT" }
  | { type: "REMOVE_FROM_POOL"; id: SymbolId }
  | { type: "ACK_GREEN_MAN" }
  | { type: "RESTART" };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "BEGIN_SPIN": {
      if (state.phase.kind !== "idle") return state;
      return {
        ...state,
        grid: rollGrid(state.pool),
        contributingCells: new Set(),
        lastScore: 0,
        lastEvents: [],
        lastPerCell: [],
        lastRewards: { rerollOrbs: 0, removalOrbs: 0 },
        lastDraft: null,
        phase: { kind: "spinning" },
      };
    }
    case "RESOLVE_SPIN": {
      if (state.phase.kind !== "spinning") return state;
      const finalGrid = rollGrid(state.pool);
      const score = scoreGrid(finalGrid, {
        totalSpins: state.totalSpins,
        roundNumber: state.titheRound + 1,
        appearanceCounts: state.appearanceCounts,
        destroyedThisRun: state.destroyedThisRun,
        alternatingTick: state.alternatingTick,
      });

      // Age each tile that landed on the grid; transform Acorn → Oak Leaf
      // after its 5th appearance (per-instance, not per id).
      const events: SpinEvent[] = [...score.events];
      const nextPool: PoolTile[] = state.pool.map((t) => {
        const landed = finalGrid.some((c) => c && c.uid === t.uid);
        if (!landed) return t;
        const aged: PoolTile = { ...t, age: t.age + 1 };
        if (aged.id === "acorn" && aged.age >= 5) {
          const cellIdx = finalGrid.findIndex((c) => c && c.uid === t.uid);
          events.push({ kind: "transform", cell: cellIdx, from: "acorn", to: "oak_leaf" });
          return { ...makeTile("oak_leaf"), uid: t.uid };
        }
        return aged;
      });
      const displayedGrid: (PoolTile | null)[] = finalGrid.map((cell) =>
        cell ? nextPool.find((t) => t.uid === cell.uid) ?? cell : null,
      );

      const nextSpin = state.spinInCycle + 1;
      const nextOrbs = state.orbs + score.orbs;
      const nextRerollOrbs = state.rerollOrbs + score.rerollOrbsGained;
      const nextRemovalOrbs = Math.min(
        REMOVAL_ORB_CAP,
        state.removalOrbs + score.removalOrbsGained,
      );
      const draftOffers = pickDraft(DRAFT_POOL, state.titheRound);

      const base: GameState = {
        ...state,
        pool: nextPool,
        grid: displayedGrid,
        orbs: nextOrbs,
        rerollOrbs: nextRerollOrbs,
        removalOrbs: nextRemovalOrbs,
        lastScore: score.orbs,
        lastRewards: {
          rerollOrbs: score.rerollOrbsGained,
          removalOrbs: score.removalOrbsGained,
        },
        lastEvents: events,
        lastPerCell: score.perCell,
        contributingCells: score.contributingCells,
        appearanceCounts: score.appearanceCountsNext,
        totalSpins: state.totalSpins + 1,
        alternatingTick: !state.alternatingTick,
        spinInCycle: nextSpin,
        // Default: every spin opens a draft offer immediately.
        phase: { kind: "draft", offers: draftOffers },
      };

      // Tithe check at the end of the current tithe's spin allotment.
      const currentStep = TITHE_SCHEDULE[state.titheRound];
      if (currentStep && nextSpin >= currentStep.spins) {
        const required = currentStep.orbs;
        if (nextOrbs >= required) {
          const newRound = state.titheRound + 1;
          if (newRound >= TITHE_SCHEDULE.length) {
            return { ...base, phase: { kind: "win" } };
          }
          return {
            ...base,
            phase: { kind: "tithe-passed", round: state.titheRound + 1 },
          };
        }
        return {
          ...base,
          phase: {
            kind: "tithe-failed",
            round: state.titheRound + 1,
            orbs: nextOrbs,
            required,
          },
        };
      }
      return { ...base, lastDraft: { offers: draftOffers, picked: null } };
    }
    case "ACK_TITHE_PASS": {
      // Subtract the paid tithe cost (surplus carries over), advance round,
      // and silently grant +1 Removal Orb (capped). The player spends it
      // whenever they like through the Inventory modal — no thinning prompt.
      const paidStep = TITHE_SCHEDULE[state.titheRound];
      const remainingOrbs = Math.max(0, state.orbs - (paidStep?.orbs ?? 0));
      const draftOffers = pickDraft(DRAFT_POOL, state.titheRound + 1);
      const nextRemovalOrbs = Math.min(REMOVAL_ORB_CAP, state.removalOrbs + 1);
      return {
        ...state,
        orbs: remainingOrbs,
        removalOrbs: nextRemovalOrbs,
        spinInCycle: 0,
        titheRound: state.titheRound + 1,
        phase: { kind: "draft", offers: draftOffers },
        lastDraft: { offers: draftOffers, picked: null },
      };
    }
    case "REROLL_DRAFT": {
      if (state.phase.kind !== "draft") return state;
      if (state.rerollOrbs <= 0) return state;
      const offers = pickDraft(DRAFT_POOL, state.titheRound);
      return {
        ...state,
        rerollOrbs: state.rerollOrbs - 1,
        phase: { kind: "draft", offers },
        lastDraft: { offers, picked: null },
      };
    }
    case "REMOVE_FROM_POOL": {
      if (state.removalOrbs <= 0) return state;
      // Discarding is purely player-initiated from the Inventory modal.
      // Allowed any time the modal is open (idle phase only).
      if (state.phase.kind !== "idle") return state;
      const idx = state.pool.findIndex((t) => t.id === action.id);
      if (idx < 0) return state;
      const nextPool = state.pool.slice();
      nextPool.splice(idx, 1);
      return {
        ...state,
        pool: nextPool,
        grid: rollGrid(nextPool),
        removalOrbs: state.removalOrbs - 1,
        destroyedThisRun: state.destroyedThisRun + 1,
      };
    }
    case "PICK_DRAFT": {
      if (state.phase.kind !== "draft") return state;
      const added = makeTile(action.id);
      const nextPool: PoolTile[] = [...state.pool, added];

      // Green Man's `transformCommon`: pick up to 3 Common tiles in the pool
      // and replace them with random Uncommons. Fires on draft pick only.
      let upgradePhase: Phase | null = null;
      if (action.id === "green_man") {
        const commonIdxs = nextPool
          .map((t, idx) => ({ idx, id: t.id }))
          .filter((p) => COMMON_IDS.includes(p.id))
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
        if (commonIdxs.length > 0) {
          const fromIds: SymbolId[] = [];
          const toIds: SymbolId[] = [];
          for (const { idx } of commonIdxs) {
            const newId = UNCOMMON_IDS[Math.floor(Math.random() * UNCOMMON_IDS.length)];
            fromIds.push(nextPool[idx].id);
            toIds.push(newId);
            nextPool[idx] = { ...makeTile(newId), uid: nextPool[idx].uid };
          }
          upgradePhase = { kind: "green-man-upgrade", from: fromIds, to: toIds };
        }
      }

      return {
        ...state,
        pool: nextPool,
        grid: rollGrid(nextPool),
        contributingCells: new Set(),
        phase: upgradePhase ?? { kind: "idle" },
        lastDraft: state.lastDraft ? { ...state.lastDraft, picked: action.id } : null,
      };
    }
    case "ACK_GREEN_MAN": {
      if (state.phase.kind !== "green-man-upgrade") return state;
      return { ...state, phase: { kind: "idle" } };
    }
    case "SKIP_DRAFT": {
      if (state.phase.kind !== "draft") return state;
      return { ...state, phase: { kind: "idle" } };
    }
    case "RESTART":
      return initialState();
    default:
      return state;
  }
}

// -------- UI ---------------------------------------------------------------

function PlayPage() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [poolOpen, setPoolOpen] = useState(false);
  // Sequential score reveal (LBaL-style). Purely visual; never mutates score.
  type RevealPhase = "cells" | "rewards" | "total" | "done";
  type RevealFloat = { id: number; cell: number; value: number };
  const [reveal, setReveal] = useState<{
    idx: number;            // last cell index revealed (-1 before first)
    running: number;        // running total shown in the tray
    floats: RevealFloat[];  // active "+N" floats; each lingers ~750ms
    floatSeq: number;       // monotonic id for floats
    phase: RevealPhase;
    spinSerial: number;     // ties reveal to a specific spin
  } | null>(null);
  const [tooltip, setTooltip] = useState<
    | { kind: "cell"; index: number }
    | { kind: "pool"; id: SymbolId }
    | null
  >(null);
  const [highlightGroup, setHighlightGroup] = useState<SynergyGroupId | null>(null);

  // After BEGIN_SPIN, settle the spin after a short animation window.
  useEffect(() => {
    if (state.phase.kind !== "spinning") return;
    const t = setTimeout(() => dispatch({ type: "RESOLVE_SPIN" }), 650);
    return () => clearTimeout(t);
  }, [state.phase.kind]);

  // Kick off the sequential reveal whenever a spin resolves into a post-spin
  // phase. `state.totalSpins` is the stable serial — it ticks once per spin.
  const isPostSpinPhase =
    state.phase.kind === "draft" ||
    state.phase.kind === "tithe-passed" ||
    state.phase.kind === "tithe-failed" ||
    state.phase.kind === "win";
  useEffect(() => {
    if (state.phase.kind === "spinning" || state.phase.kind === "idle") {
      setReveal(null);
      return;
    }
    if (!isPostSpinPhase) return;
    // Skip animation entirely on zero-score spins.
    if (state.lastScore === 0 && state.lastEvents.length === 0) {
      setReveal({ idx: GRID_SIZE - 1, running: 0, floats: [], floatSeq: 0, phase: "done", spinSerial: state.totalSpins });
      return;
    }
    setReveal({ idx: -1, running: 0, floats: [], floatSeq: 0, phase: "cells", spinSerial: state.totalSpins });
    // Intentionally only on spin transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.totalSpins]);

  // Drive the reveal forward.
  useEffect(() => {
    if (!reveal || reveal.phase === "done") return;
    if (reveal.phase === "cells") {
      if (reveal.idx >= GRID_SIZE - 1) {
        const hasReward = state.lastRewards.rerollOrbs > 0 || state.lastRewards.removalOrbs > 0;
        const t = setTimeout(() => {
          setReveal((r) => (r ? { ...r, phase: hasReward ? "rewards" : "total" } : r));
        }, 320);
        return () => clearTimeout(t);
      }
      const nextIdx = reveal.idx + 1;
      const v = state.lastPerCell[nextIdx] ?? 0;
      const delay = v > 0 ? 140 : 28; // scoring tiles linger; skim past empties
      const t = setTimeout(() => {
        setReveal((r) =>
          r && r.phase === "cells"
            ? {
                ...r,
                idx: nextIdx,
                running: r.running + v,
                floats:
                  v > 0
                    ? [...r.floats, { id: r.floatSeq + 1, cell: nextIdx, value: v }]
                    : r.floats,
                floatSeq: v > 0 ? r.floatSeq + 1 : r.floatSeq,
              }
            : r,
        );
      }, delay);
      return () => clearTimeout(t);
    }
    if (reveal.phase === "rewards") {
      const t = setTimeout(() => setReveal((r) => (r ? { ...r, phase: "total" } : r)), 650);
      return () => clearTimeout(t);
    }
    if (reveal.phase === "total") {
      const t = setTimeout(() => setReveal((r) => (r ? { ...r, phase: "done" } : r)), 750);
      return () => clearTimeout(t);
    }
  }, [reveal, state.lastPerCell, state.lastRewards.rerollOrbs, state.lastRewards.removalOrbs]);

  // Retire floats after their rise animation completes so the list doesn't grow.
  useEffect(() => {
    if (!reveal || reveal.floats.length === 0) return;
    const oldest = reveal.floats[0];
    const t = setTimeout(() => {
      setReveal((r) =>
        r ? { ...r, floats: r.floats.filter((f) => f.id !== oldest.id) } : r,
      );
    }, 780);
    return () => clearTimeout(t);
  }, [reveal?.floats]);

  const skipReveal = useCallback(() => {
    setReveal((r) =>
      r && r.phase !== "done"
        ? { ...r, idx: GRID_SIZE - 1, running: state.lastScore, floats: [], phase: "done" }
        : r,
    );
  }, [state.lastScore]);

  const revealing = reveal != null && reveal.phase !== "done";
  const overlaysGated = revealing && isPostSpinPhase;

  const currentTithe = TITHE_SCHEDULE[state.titheRound];
  const titheRequired = currentTithe?.orbs ?? 0;
  const titheSpinCount = currentTithe?.spins ?? 0;
  const spinsLeft = Math.max(0, titheSpinCount - state.spinInCycle);
  const titheWarning = state.titheRound < TITHE_SCHEDULE.length && spinsLeft <= 2 && state.phase.kind !== "spinning";

  const canSpin = state.phase.kind === "idle";

  const onSpin = useCallback(() => {
    setTooltip(null);
    dispatch({ type: "BEGIN_SPIN" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTooltip(null);
        setHighlightGroup(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Min age across all instances per id (for Acorn countdown tooltip).
  const minAgeById = useMemo(() => {
    const m: Partial<Record<SymbolId, number>> = {};
    for (const t of state.pool) {
      const cur = m[t.id];
      m[t.id] = cur == null ? t.age : Math.min(cur, t.age);
    }
    return m;
  }, [state.pool]);

  const onTooltipChip = (g: SynergyGroupId) => {
    setHighlightGroup((cur) => (cur === g ? null : g));
  };
  const highlightedMembers: SymbolId[] = highlightGroup
    ? [...SYNERGY_GROUPS[highlightGroup].members]
    : [];

  return (
    <div
      className="midsummer-root"
      onClick={() => {
        setTooltip(null);
        if (revealing) skipReveal();
      }}
    >
      {/* Forest backdrop */}
      <div
        className="midsummer-bg"
        style={{ backgroundImage: `url(${backgroundAsset.url})` }}
        aria-hidden
      />
      <div className="midsummer-vignette" aria-hidden />

      <main className="midsummer-stage" onClick={(e) => e.stopPropagation()}>
        <Header
          orbs={state.orbs}
          rerollOrbs={state.rerollOrbs}
          removalOrbs={state.removalOrbs}
          titheRequired={titheRequired}
          spinInCycle={state.spinInCycle}
          titheRound={state.titheRound}
          titheSpinCount={titheSpinCount}
          onOpenInventory={() => setPoolOpen(true)}
        />

        {titheWarning && (
          <div className="tithe-warning animate-fade-in">
            <span>🔔</span> Tithe in {spinsLeft || "now"} — need {titheRequired} orbs
          </div>
        )}

        {highlightGroup && (
          <button className="group-banner" onClick={() => setHighlightGroup(null)}>
            <span className="group-banner-dot" /> Highlighting{" "}
            <b>{SYNERGY_GROUPS[highlightGroup].name}</b>
            <span className="group-banner-close">×</span>
          </button>
        )}

        <SlotFrame
          grid={state.grid}
          contributing={state.contributingCells}
          spinning={state.phase.kind === "spinning"}
          highlightedMembers={highlightedMembers}
          highlightGroup={highlightGroup}
          openTooltipCell={tooltip && tooltip.kind === "cell" ? tooltip.index : null}
          onCellClick={(idx, hasSymbol) => {
            if (revealing) { skipReveal(); return; }
            if (!hasSymbol) { setTooltip(null); return; }
            setTooltip((cur) =>
              cur && cur.kind === "cell" && cur.index === idx ? null : { kind: "cell", index: idx },
            );
          }}
          onChipClick={onTooltipChip}
          revealFloats={reveal ? reveal.floats : []}
          acornCountdown={Math.max(0, 5 - (minAgeById["acorn"] ?? 0))}
          titheRound={state.titheRound + 1}
          orbs={state.orbs}
          titheRequirement={titheRequired}
          spinsTaken={state.spinInCycle}
          spinsPerCycle={titheSpinCount}
        />

        <SpinBar
          canSpin={canSpin}
          onSpin={() => { if (revealing) { skipReveal(); return; } onSpin(); }}
          spinning={state.phase.kind === "spinning"}
          reveal={reveal}
          finalScore={state.lastScore}
          rewards={state.lastRewards}
          pool={state.pool}
          onViewPool={() => setPoolOpen(true)}
        />

        <SpinLog
          events={state.lastEvents}
          orbs={state.lastScore}
          rewards={state.lastRewards}
          totalSpins={state.totalSpins}
          lastDraft={state.lastDraft}
        />
      </main>

      {/* Overlays */}
      {poolOpen && (
        <Overlay elevated>
          <h2 className="overlay-title">Bag</h2>
          <div className="inventory-totals">
            <div className="inventory-total-row">
              <span className="inventory-total-label">Symbols</span>
              <span className="inventory-total-value">{state.pool.length}</span>
            </div>
            <div className={`inventory-total-row ${FEATURES.items ? "" : "is-stub"}`}>
              <span className="inventory-total-label">Items</span>
              <span className="inventory-total-value">
                {FEATURES.items ? state.items.length : "Coming soon"}
              </span>
            </div>
            <div className={`inventory-total-row ${FEATURES.essences ? "" : "is-stub"}`}>
              <span className="inventory-total-label">Essences</span>
              <span className="inventory-total-value">
                {FEATURES.essences ? state.essences.length : "Coming soon"}
              </span>
            </div>
            <button
              type="button"
              className={`inventory-orb-chip ${state.removalOrbs <= 0 ? "is-empty" : ""}`}
              disabled={state.removalOrbs <= 0}
              title={state.removalOrbs > 0
                ? "Click a symbol below to discard it (spends 1 Removal Orb)"
                : "No Removal Orbs — earn more from spins"}
            >
              <span className="inventory-orb-icon">✕</span>
              <span className="inventory-orb-count">{state.removalOrbs}</span>
              <span className="inventory-orb-label">Removal Orbs</span>
            </button>
          </div>
          <p className="overlay-sub">
            {state.removalOrbs > 0
              ? "Click a symbol to discard it permanently — costs 1 ✕ Removal Orb."
              : "Earn Removal Orbs from spins to discard symbols from your bag."}
          </p>
          <div className="pool-grid">
            {poolCounts(state.pool).map(([id, count]) => {
              const def = SYMBOLS[id];
              const isHi = highlightedMembers.includes(id);
              const open = tooltip && tooltip.kind === "pool" && tooltip.id === id;
              const canDiscard = state.removalOrbs > 0;
              return (
                <div
                  key={id}
                  className={`pool-grid-chip ${isHi ? "cell-grouped" : ""} ${open ? "tip-open" : ""} ${canDiscard ? "removable" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canDiscard) {
                      dispatch({ type: "REMOVE_FROM_POOL", id });
                      return;
                    }
                    setTooltip((cur) =>
                      cur && cur.kind === "pool" && cur.id === id ? null : { kind: "pool", id },
                    );
                  }}
                >
                  {def.sprite ? (
                    <img src={def.sprite} alt={def.name} className="pixelart" />
                  ) : (
                    <span className="pool-grid-emoji" aria-hidden>{def.emoji}</span>
                  )}
                  <span className="pool-grid-count">×{count}</span>
                  <span className="pool-grid-name">{def.name}</span>
                  {open && (
                    <SymbolTooltip
                      id={id}
                      onChipClick={onTooltipChip}
                      highlightGroup={highlightGroup}
                      extra={
                        id === "acorn"
                          ? `Transforms in ${Math.max(0, 5 - (minAgeById["acorn"] ?? 0))} more spin(s)`
                          : null
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="pool-actions">
            <button className="primary-btn" onClick={() => { setPoolOpen(false); setTooltip(null); }}>Close</button>
          </div>
        </Overlay>
      )}

      {state.phase.kind === "tithe-passed" && (
        !overlaysGated &&
        <Overlay>
          <h2 className="overlay-title">Tithe paid</h2>
          <p className="overlay-sub">
            Round {state.phase.round} of {TITHE_SCHEDULE.length} cleared.
            <br />The forest is appeased. For now.
            <br /><span className="tithe-bonus">+1 ✕ Removal Orb</span>
          </p>
          <button
            className="primary-btn"
            onClick={() => dispatch({ type: "ACK_TITHE_PASS" })}
          >
            Continue
          </button>
        </Overlay>
      )}

      {state.phase.kind === "green-man-upgrade" && (
        <Overlay>
          <h2 className="overlay-title">The Green Man stirs</h2>
          <p className="overlay-sub">
            Roots reach into your bag and lift {state.phase.from.length} common
            tile{state.phase.from.length === 1 ? "" : "s"} into stronger forms.
          </p>
          <div className="upgrade-list">
            {state.phase.from.map((from, i) => {
              const to = state.phase.kind === "green-man-upgrade" ? state.phase.to[i] : from;
              const f = SYMBOLS[from], t = SYMBOLS[to];
              return (
                <div key={i} className="upgrade-row">
                  <span className="upgrade-emoji">{f.emoji}</span>
                  <span className="upgrade-name">{f.name}</span>
                  <span className="upgrade-arrow">→</span>
                  <span className="upgrade-emoji">{t.emoji}</span>
                  <span className="upgrade-name">{t.name}</span>
                </div>
              );
            })}
          </div>
          <button className="primary-btn" onClick={() => dispatch({ type: "ACK_GREEN_MAN" })}>
            Continue
          </button>
        </Overlay>
      )}

      {state.phase.kind === "draft" && !overlaysGated && (
        <Overlay>
          <h2 className="overlay-title">Add a symbol?</h2>
          <p className="overlay-sub">
            Pick one to add to your pool — it will appear in future spins.
            <br />
            Or skip to keep your pool lean.
          </p>
          <div className="draft-grid">
            {state.phase.offers.map((id) => {
              const def = SYMBOLS[id];
              const groups = groupsForSymbol(id);
              const rarityLabel = def.rarity === "very_rare" ? "Very Rare" : def.rarity.charAt(0).toUpperCase() + def.rarity.slice(1);
              return (
                <button
                  key={id}
                  className="draft-card"
                  onClick={() => dispatch({ type: "PICK_DRAFT", id })}
                >
                  {def.sprite ? (
                    <img src={def.sprite} alt={def.name} className="pixelart" />
                  ) : (
                    <span className="draft-emoji" aria-hidden>{def.emoji}</span>
                  )}
                  <div className="draft-name">{def.name}</div>
                  <div className={`draft-rarity rarity-${def.rarity}`}>{rarityLabel}</div>
                  <div className="draft-points">+{def.baseValue} ◐</div>
                  <div className="draft-desc">{cardBodyText(def)}</div>
                  {groups.length > 0 && (
                    <div className="draft-groups">
                      {groups.map((g) => (
                        <span key={g} className="group-chip-mini">{SYNERGY_GROUPS[g].name}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="draft-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setPoolOpen(true)}
            >
              Bag ({state.pool.length})
            </button>
            <button
              type="button"
              className="ghost-btn"
              disabled={state.rerollOrbs <= 0}
              onClick={() => dispatch({ type: "REROLL_DRAFT" })}
            >
              Reroll ↺ {state.rerollOrbs}
            </button>
            <button className="ghost-btn" onClick={() => dispatch({ type: "SKIP_DRAFT" })}>
              skip
            </button>
          </div>
        </Overlay>
      )}

      {state.phase.kind === "tithe-failed" && !overlaysGated && (
        <Overlay>
          <h2 className="overlay-title">The forest claims its due</h2>
          <p className="overlay-sub">
            Round {state.phase.round}: {state.phase.orbs} / {state.phase.required} orbs.
          </p>
          <button className="primary-btn" onClick={() => dispatch({ type: "RESTART" })}>
            Try again
          </button>
        </Overlay>
      )}

      {state.phase.kind === "win" && !overlaysGated && (
        <Overlay>
          <img src={crownImg} alt="" className="pixelart crown" />
          <h2 className="overlay-title">Crowned of Midsummer</h2>
          <p className="overlay-sub">All three tithes paid. The wood remembers your name.</p>
          <button className="primary-btn" onClick={() => dispatch({ type: "RESTART" })}>
            New run
          </button>
        </Overlay>
      )}

    </div>
  );
}

// -------- Subcomponents ----------------------------------------------------

function Header(props: {
  orbs: number;
  rerollOrbs: number;
  removalOrbs: number;
  titheRequired: number;
  spinInCycle: number;
  titheRound: number;
  titheSpinCount: number;
  onOpenInventory: () => void;
}) {
  const totalRounds = TITHE_SCHEDULE.length;
  const spinCount = props.titheSpinCount;
  return (
    <header className="hud">
      <div className="hud-row">
        <Stat icon={<img src={orbImg} alt="" className="pixelart hud-icon" />} value={props.orbs} label="Light Orbs" />
        <Stat icon={<span className="hud-reroll">↺</span>} value={props.rerollOrbs} label="Reroll Orbs" />
        <button
          type="button"
          className="stat stat-button"
          title="Open your bag to discard symbols (costs 1 Removal Orb)"
          onClick={(e) => { e.stopPropagation(); props.onOpenInventory(); }}
        >
          <span className="hud-removal">✕</span>
          <span className="stat-value">{props.removalOrbs}</span>
        </button>
      </div>
      <div className="hud-tithe">
        <span>Spin {Math.min(props.spinInCycle + 1, spinCount)} / {spinCount}</span>
        <span className="hud-dot">·</span>
        <span>
          Tithe {Math.min(props.titheRound + 1, totalRounds)}/{totalRounds}: {props.orbs}/{props.titheRequired}
        </span>
      </div>
    </header>
  );
}

function Stat(props: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="stat" title={props.label}>
      {props.icon}
      <span className="stat-value">{props.value}</span>
    </div>
  );
}

const CABINET_SOURCE_W = 1024;
const CABINET_SOURCE_H = 1536;
// Measured from cabinet_clean.png — square pitch on both axes.
const PANEL_GRID = {
  left: 238,
  top: 436,
  cell: 108.2,
  cols: 5,
  rows: 4,
};
const PANEL_TITHE = {
  left: 238,
  top: 869,
  width: 541,
  height: 156,
};
const SHOW_GRID_DEBUG = false; // flip to true to re-check alignment

function seasonForRound(round: number): string {
  if (round <= 3) return "Spring";
  if (round <= 6) return "Midsummer";
  if (round <= 9) return "Late Summer";
  if (round <= 12) return "Dawn";
  return "Endless";
}

function TitheMeter(props: {
  round: number;
  orbs: number;
  requirement: number;
  spinsTaken: number;
  spinsPerCycle: number;
}) {
  const perCycle = props.spinsPerCycle;
  const spinsLeft = Math.max(0, perCycle - props.spinsTaken);
  const pct = Math.min(100, (props.orbs / Math.max(1, props.requirement)) * 100);
  const met = props.orbs >= props.requirement;
  return (
    <div className="tithe-meter-wrap">
      <div className="tithe-meter">
        <div className="tithe-meter__head">
          <span className="tithe-meter__season">
            {seasonForRound(props.round)} · Round {props.round}
          </span>
          <span className="tithe-meter__spins">
            {spinsLeft === 0 ? "Bell tolling" : `${spinsLeft} spin${spinsLeft === 1 ? "" : "s"} to the bell`}
          </span>
        </div>
        <div className={`tithe-meter__bar${met ? " is-met" : ""}`}>
          <div className="tithe-meter__fill" style={{ width: `${pct}%` }} />
          <div className="tithe-meter__count">
            {props.orbs} / {props.requirement} ✨
          </div>
          <div className="tithe-meter__bell">{met ? "🔔" : "🛎️"}</div>
        </div>
      </div>
    </div>
  );
}
function SlotFrame(props: {
  grid: (PoolTile | null)[];
  contributing: Set<number>;
  spinning: boolean;
  highlightedMembers: SymbolId[];
  highlightGroup: SynergyGroupId | null;
  openTooltipCell: number | null;
  onCellClick: (idx: number, hasSymbol: boolean) => void;
  onChipClick: (g: SynergyGroupId) => void;
  revealFloats: { id: number; cell: number; value: number }[];
  acornCountdown: number;
  titheRound: number;
  orbs: number;
  titheRequirement: number;
  spinsTaken: number;
  spinsPerCycle: number;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const cabinetImageRef = useRef<HTMLImageElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const hasLoggedCabinetLayoutRef = useRef(false);

  const logCabinetLayout = useCallback(() => {
    const frame = frameRef.current;
    const cabinetImage = cabinetImageRef.current;
    if (!frame || !cabinetImage || hasLoggedCabinetLayoutRef.current) return;
    const cabinetRect = cabinetImage.getBoundingClientRect();
    if (cabinetRect.width <= 0 || cabinetRect.height <= 0) return;
    const computedFrameStyles = getComputedStyle(frame);
    const payload = {
      cabinetRendered: {
        left: cabinetRect.left,
        top: cabinetRect.top,
        width: cabinetRect.width,
        height: cabinetRect.height,
      },
      cabinetNatural: {
        width: cabinetImage.naturalWidth,
        height: cabinetImage.naturalHeight,
      },
      devicePixelRatio: window.devicePixelRatio || 1,
      cssVariables: {
        "--grid-left-px": computedFrameStyles.getPropertyValue("--grid-left-px").trim(),
        "--grid-top-px": computedFrameStyles.getPropertyValue("--grid-top-px").trim(),
          "--cell-px": computedFrameStyles.getPropertyValue("--cell-px").trim(),
        "--sprite-px": computedFrameStyles.getPropertyValue("--sprite-px").trim(),
      },
    };
    console.log(`[SlotFrame] cabinet layout calibration ${JSON.stringify(payload)}`);
    hasLoggedCabinetLayoutRef.current = true;
  }, []);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const cabinetImage = cabinetImageRef.current;
    if (!frame || !cabinetImage) return;

    const recompute = () => {
      const rect = cabinetImage.getBoundingClientRect();
      if (rect.width <= 0) return;
      const scale = rect.width / CABINET_SOURCE_W;
      const scaleY = rect.height / CABINET_SOURCE_H;
      if (import.meta.env.DEV && Math.abs(scale - scaleY) > 0.01) {
        console.warn("[SlotFrame] cabinet aspect scale mismatch", { scaleX: scale, scaleY });
      }
      const cellPx = PANEL_GRID.cell * scale;
      const spritePx = cellPx * 0.74;

      frame.style.setProperty("--grid-left-px", `${PANEL_GRID.left * scale}px`);
      frame.style.setProperty("--grid-top-px", `${PANEL_GRID.top * scale}px`);
      frame.style.setProperty("--cell-px", `${cellPx}px`);
      frame.style.setProperty("--sprite-px", `${spritePx}px`);

      frame.style.setProperty("--tithe-left-px", `${PANEL_TITHE.left * scale}px`);
      frame.style.setProperty("--tithe-top-px", `${PANEL_TITHE.top * scale}px`);
      frame.style.setProperty("--tithe-w-px", `${PANEL_TITHE.width * scale}px`);
      frame.style.setProperty("--tithe-h-px", `${PANEL_TITHE.height * scale}px`);
      requestAnimationFrame(logCabinetLayout);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(frame);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [logCabinetLayout]);

  useEffect(() => {
    const raf = requestAnimationFrame(logCabinetLayout);
    const timeout = window.setTimeout(logCabinetLayout, 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [logCabinetLayout]);

  return (
    <div
      className="slot-frame"
      ref={frameRef}
      style={{ position: "relative", lineHeight: 0, background: "transparent", overflow: "hidden" }}
    >
      <img
        ref={cabinetImageRef}
        src={cabinetImg}
        alt=""
        className="cabinet-frame pixelart"
        style={{ display: "block", width: "100%", height: "auto", border: "none", outline: "none", boxShadow: "none" }}
        onLoad={() => requestAnimationFrame(logCabinetLayout)}
        aria-hidden
      />
      <div className="slot-panel" aria-hidden>
        {Array.from({ length: GRID_SIZE }).map((_, i) => (
          <div key={i} className="panel-cell" />
        ))}
      </div>
      {SHOW_GRID_DEBUG && import.meta.env.DEV && (
        <div
          className="slot-grid-dev-overlay"
          style={{
            position: "absolute",
            left: "var(--grid-left-px)",
            top: "var(--grid-top-px)",
            display: "grid",
            gridTemplateColumns: `repeat(${PANEL_GRID.cols}, var(--cell-px))`,
            gridTemplateRows: `repeat(${PANEL_GRID.rows}, var(--cell-px))`,
            gap: 0,
            outline: "2px solid red",
            pointerEvents: "none",
            zIndex: 50,
          }}
          aria-hidden
        >
          {Array.from({ length: PANEL_GRID.cols * PANEL_GRID.rows }).map((_, i) => (
            <div
              key={i}
              style={{
                width: "var(--cell-px)",
                height: "var(--cell-px)",
                aspectRatio: "1 / 1",
                outline: "1px solid rgba(255, 0, 0, 0.6)",
                boxSizing: "border-box",
              }}
            />
          ))}
        </div>
      )}
      <div className="slot-grid" ref={gridRef}>
        {props.grid.map((tile, i) => {
          if (tile == null) {
            return (
              <div
                key={i}
                className="cell cell-empty"
                onClick={(e) => { e.stopPropagation(); props.onCellClick(i, false); }}
                aria-hidden
              />
            );
          }
          const id = tile.id;
          const def = SYMBOLS[id];
          const isHot = props.contributing.has(i) && !props.spinning;
          const isHi = props.highlightedMembers.includes(id);
          const isOpen = props.openTooltipCell === i && !props.spinning;
          return (
            <div
              key={i}
              className={`cell ${isHot ? "cell-hot" : ""} ${isHi ? "cell-grouped" : ""}`}
              onClick={(e) => { e.stopPropagation(); props.onCellClick(i, true); }}
            >
              {props.revealFloats
                .filter((f) => f.cell === i)
                .map((f) => (
                  <div key={f.id} className="cell-pop">
                    +{f.value}
                  </div>
                ))}
              {def.sprite ? (
                <img
                  key={`${id}-${i}-${props.spinning ? "s" : "r"}`}
                  src={def.sprite}
                  alt={def.name}
                  className={`pixelart cell-sprite ${props.spinning ? "spinning" : "settled"}`}
                  style={{ animationDelay: `${(i % GRID_COLS) * 40}ms` }}
                />
              ) : (
                <span
                  key={`${id}-${i}-${props.spinning ? "s" : "r"}`}
                  className={`cell-emoji ${props.spinning ? "spinning" : "settled"}`}
                  style={{ animationDelay: `${(i % GRID_COLS) * 40}ms` }}
                  aria-label={def.name}
                  role="img"
                >
                  {def.emoji}
                </span>
              )}
              {isOpen && (
                <SymbolTooltip
                  id={id}
                  onChipClick={props.onChipClick}
                  highlightGroup={props.highlightGroup}
                  extra={
                    id === "acorn"
                      ? props.acornCountdown === 0
                        ? "Transforms next spin"
                        : `Transforms in ${props.acornCountdown} more spin(s)`
                      : null
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        className="tithe-meter-slot"
        style={{
          position: "absolute",
          left: "var(--tithe-left-px)",
          top: "var(--tithe-top-px)",
          width: "var(--tithe-w-px)",
          height: "var(--tithe-h-px)",
          zIndex: 5,
        }}
      >
        <TitheMeter
          round={props.titheRound}
          orbs={props.orbs}
          requirement={props.titheRequirement}
          spinsTaken={props.spinsTaken}
          spinsPerCycle={props.spinsPerCycle}
        />
      </div>
    </div>
  );
}

function SpinBar(props: {
  canSpin: boolean;
  onSpin: () => void;
  spinning: boolean;
  reveal: {
    idx: number;
    running: number;
    floats: { id: number; cell: number; value: number }[];
    floatSeq: number;
    phase: "cells" | "rewards" | "total" | "done";
    spinSerial: number;
  } | null;
  finalScore: number;
  rewards: { rerollOrbs: number; removalOrbs: number };
  pool: PoolTile[];
  onViewPool: () => void;
}) {
  const r = props.reveal;
  const showTray = r != null;
  const flashTotal = r?.phase === "total";
  const showRewards = r?.phase === "rewards" || r?.phase === "total";
  const displayValue = r?.phase === "done" ? r.running : r?.running ?? 0;
  return (
    <div className="spin-bar">
      {showTray && (
        <div className={`reveal-tray ${flashTotal ? "is-flash" : ""}`}>
          <span className="reveal-tray-total">
            +{displayValue}
            <img src={orbImg} alt="" className="pixelart reveal-tray-orb" />
          </span>
          {showRewards && (props.rewards.rerollOrbs > 0 || props.rewards.removalOrbs > 0) && (
            <span className="reveal-tray-rewards">
              {props.rewards.rerollOrbs > 0 && (
                <span className="reveal-tray-chip">+{props.rewards.rerollOrbs} ↺</span>
              )}
              {props.rewards.removalOrbs > 0 && (
                <span className="reveal-tray-chip">+{props.rewards.removalOrbs} ✕</span>
              )}
            </span>
          )}
        </div>
      )}
      <button className="view-pool-btn" onClick={props.onViewPool}>
        Bag ({props.pool.length})
      </button>
      <div className="spin-button-wrap">
        <button
          className="spin-btn"
          onClick={props.onSpin}
          disabled={!props.canSpin}
        >
          {props.spinning ? "Spinning…" : "Spin"}
        </button>
      </div>
    </div>
  );
}

function Overlay(props: { children: React.ReactNode; elevated?: boolean }) {
  return (
    <div className="overlay animate-fade-in" style={props.elevated ? { zIndex: 60 } : undefined}>
      <div className="overlay-card">{props.children}</div>
    </div>
  );
}

// -------- Symbol tooltip --------------------------------------------------

function SymbolTooltip(props: {
  id: SymbolId;
  onChipClick: (g: SynergyGroupId) => void;
  highlightGroup: SynergyGroupId | null;
  extra: string | null;
}) {
  const def = SYMBOLS[props.id];
  const groups = groupsForSymbol(props.id);
  return (
    <div className="symbol-tip" onClick={(e) => e.stopPropagation()}>
      <div className="symbol-tip-head">
        <span className="symbol-tip-emoji">{def.emoji}</span>
        <div className="symbol-tip-headtext">
          <div className="symbol-tip-name">{def.name}</div>
          <div className={`symbol-tip-rarity rarity-${def.rarity}`}>
            {def.rarity.replace("_", " ")}
          </div>
        </div>
      </div>
      <div className="symbol-tip-base">Base: +{def.baseValue} ◐</div>
      <div className="symbol-tip-desc">{cardBodyText(def)}</div>
      {props.extra && <div className="symbol-tip-extra">⏳ {props.extra}</div>}
      {groups.length > 0 && (
        <div className="symbol-tip-groups">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className={`group-chip ${props.highlightGroup === g ? "active" : ""}`}
              onClick={(e) => { e.stopPropagation(); props.onChipClick(g); }}
            >
              {SYNERGY_GROUPS[g].name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// -------- Spin breakdown panel --------------------------------------------

function SpinLog(props: {
  events: SpinEvent[];
  orbs: number;
  rewards: { rerollOrbs: number; removalOrbs: number };
  totalSpins: number;
  lastDraft: { offers: SymbolId[]; picked: SymbolId | null } | null;
}) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, { id: SymbolId; cell: number; entries: SpinEvent[]; subtotal: number }>();
    for (const ev of props.events) {
      const id = ev.kind === "transform" ? ev.from : ev.id;
      const key = `${ev.cell}-${id}`;
      const cur = map.get(key) ?? { id, cell: ev.cell, entries: [], subtotal: 0 };
      cur.entries.push(ev);
      if (ev.kind === "base") cur.subtotal += ev.orbs;
      else if (ev.kind === "synergy" && ev.orbsDelta) cur.subtotal += ev.orbsDelta;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.subtotal - a.subtotal);
  }, [props.events]);

  const logText = useMemo(() => {
    if (props.totalSpins === 0) return "Spin to begin — synergies will appear here";
    let text = `Spin ${props.totalSpins}: +${props.orbs} orbs`;
    if (props.rewards.rerollOrbs > 0) text += ` | +${props.rewards.rerollOrbs} reroll`;
    if (props.rewards.removalOrbs > 0) text += ` | +${props.rewards.removalOrbs} removal`;
    text += "\n";
    if (props.lastDraft) {
      const offerNames = props.lastDraft.offers.map((id) => SYMBOLS[id].name);
      text += `\nDraft: ${offerNames.join(", ")}`;
      if (props.lastDraft.picked) {
        text += ` → picked ${SYMBOLS[props.lastDraft.picked].name}`;
      } else {
        text += " → skipped";
      }
      text += "\n";
    }
    for (const g of groups) {
      const def = SYMBOLS[g.id];
      text += `\n${def.name} +${g.subtotal} orbs\n`;
      for (const ev of g.entries) {
        if (ev.kind === "base") {
          text += `  base: +${ev.orbs} orbs\n`;
        } else if (ev.kind === "synergy") {
          text += `  ${ev.greenManBoost ? "Green Man" : ev.synergyType}: ${ev.description}`;
          if (ev.orbsDelta != null) text += ` (+${ev.orbsDelta} orbs)`;
          if (ev.multiplier != null) text += ` (x${ev.multiplier})`;
          if (ev.rewardKind) {
            const rewardLabel = ev.rewardKind === "reroll_orb" ? "reroll" : ev.rewardKind === "removal_orb" ? "removal" : "orb";
            text += ` (+${ev.rewardAmount} ${rewardLabel})`;
          }
          text += "\n";
        } else if (ev.kind === "transform") {
          text += `  transform: ${SYMBOLS[ev.from].name} → ${SYMBOLS[ev.to].name}\n`;
        }
      }
    }
    return text.trim();
  }, [groups, props.orbs, props.rewards, props.totalSpins, props.lastDraft]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(logText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [logText]);

  return (
    <section className={`spin-log ${open ? "" : "collapsed"}`}>
      <button type="button" className="spin-log-head" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <span className="spin-log-title">
          {props.totalSpins === 0 ? "Spin to begin — synergies will appear here" : `Last spin: +${props.orbs} ◐`}
        </span>
        <span className="spin-log-rewards">
          {props.rewards.rerollOrbs > 0 && <span>+{props.rewards.rerollOrbs} ↺</span>}
          {props.rewards.removalOrbs > 0 && <span>+{props.rewards.removalOrbs} ✕</span>}
        </span>
        <span className="spin-log-toggle">{open ? "▾" : "▸"}</span>
      </button>
      {open && (groups.length > 0 || props.lastDraft) && (
        <div className="spin-log-body">
          <div className="spin-log-actions">
            <button type="button" className="spin-log-copy" onClick={(e) => { e.stopPropagation(); onCopy(); }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          {props.lastDraft && (
            <div className="spin-log-draft">
              <span className="spin-log-draft-label">Draft</span>
              <span className="spin-log-draft-choices">
                {props.lastDraft.offers.map((id) => (
                  <span key={id} className={`spin-log-draft-chip ${props.lastDraft!.picked === id ? "picked" : ""}`}>
                    {SYMBOLS[id].emoji} {SYMBOLS[id].name}
                  </span>
                ))}
              </span>
              {props.lastDraft.picked ? (
                <span className="spin-log-draft-result">→ picked {SYMBOLS[props.lastDraft.picked].name}</span>
              ) : (
                <span className="spin-log-draft-result">→ skipped</span>
              )}
            </div>
          )}
          {groups.map((g) => {
            const def = SYMBOLS[g.id];
            return (
              <div key={`${g.cell}-${g.id}`} className="spin-log-group">
                <div className="spin-log-group-head">
                  <span className="spin-log-group-emoji">{def.emoji}</span>
                  <span className="spin-log-group-name">{def.name}</span>
                  <span className="spin-log-group-sub">+{g.subtotal} ◐</span>
                </div>
                <ul className="spin-log-entries">
                  {g.entries.map((ev, idx) => (
                    <li key={idx} className="spin-log-entry">
                      {ev.kind === "base" && (
                        <>
                          <span className="ev-tag tag-base">base</span>
                          <span className="ev-text">+{ev.orbs} ◐</span>
                        </>
                      )}
                      {ev.kind === "synergy" && (
                        <>
                          <span className={`ev-tag ${ev.greenManBoost ? "tag-green" : "tag-syn"}`}>
                            {ev.greenManBoost ? "Green Man" : ev.synergyType}
                          </span>
                          <span className="ev-text">
                            {ev.description}
                            {ev.orbsDelta != null && <b> · +{ev.orbsDelta} ◐</b>}
                            {ev.multiplier != null && <b> · ×{ev.multiplier}</b>}
                            {ev.rewardKind && (
                              <b>
                                {" · +"}{ev.rewardAmount}{" "}
                                {ev.rewardKind === "reroll_orb" ? "↺"
                                  : ev.rewardKind === "removal_orb" ? "✕"
                                  : "◐"}
                              </b>
                            )}
                          </span>
                        </>
                      )}
                      {ev.kind === "transform" && (
                        <>
                          <span className="ev-tag tag-transform">transform</span>
                          <span className="ev-text">
                            {SYMBOLS[ev.from].name} → {SYMBOLS[ev.to].name}
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}