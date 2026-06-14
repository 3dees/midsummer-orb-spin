import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";

import backgroundAsset from "@/assets/background.png.asset.json";
import flameAsset from "@/assets/sprites/flame.png.asset.json";
import crownAsset from "@/assets/sprites/crown.png.asset.json";
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
} from "@/lib/midsummer/symbols";
import {
  EMBERS_PER_TITHE,
  GRID_COLS,
  GRID_SIZE,
  START_EMBERS,
  TITHE_INTERVAL,
  TITHE_REQUIREMENTS,
  type PoolTile,
  type SpinEvent,
  makeTile,
  pickDraft,
  poolCounts,
  rollGrid,
  scoreGrid,
} from "@/lib/midsummer/engine";

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
  embers: number;
  orbs: number; // banked towards tithe
  bloomShards: number;
  moonTokens: number;
  pool: PoolTile[];
  grid: (PoolTile | null)[];
  spinInCycle: number; // 0..TITHE_INTERVAL
  titheRound: number; // 0..TITHE_REQUIREMENTS.length
  totalSpins: number;
  alternatingTick: boolean;
  destroyedThisRun: number;
  appearanceCounts: Record<string, number>;
  lastScore: number;
  lastRewards: { embers: number; bloomShards: number; moonTokens: number };
  lastEvents: SpinEvent[];
  contributingCells: Set<number>;
  phase: Phase;
}

function initialState(): GameState {
  const pool = STARTING_POOL.map((id) => makeTile(id));
  return {
    embers: START_EMBERS,
    orbs: 0,
    bloomShards: 0,
    moonTokens: 0,
    pool,
    grid: new Array(GRID_SIZE).fill(null),
    spinInCycle: 0,
    titheRound: 0,
    totalSpins: 0,
    alternatingTick: false,
    destroyedThisRun: 0,
    appearanceCounts: {},
    lastScore: 0,
    lastRewards: { embers: 0, bloomShards: 0, moonTokens: 0 },
    lastEvents: [],
    contributingCells: new Set(),
    phase: { kind: "idle" },
  };
}

type Action =
  | { type: "BEGIN_SPIN" }
  | { type: "RESOLVE_SPIN" }
  | { type: "ACK_TITHE_PASS" }
  | { type: "PICK_DRAFT"; id: SymbolId }
  | { type: "SKIP_DRAFT" }
  | { type: "ACK_GREEN_MAN" }
  | { type: "RESTART" };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "BEGIN_SPIN": {
      if (state.embers <= 0) return state;
      if (state.phase.kind !== "idle") return state;
      return {
        ...state,
        embers: state.embers - 1,
        // Temporary scrambled grid while "spinning"
        grid: rollGrid(state.pool),
        contributingCells: new Set(),
        lastScore: 0,
        lastEvents: [],
        lastRewards: { embers: 0, bloomShards: 0, moonTokens: 0 },
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
      const nextEmbers = state.embers + score.embersGained;
      const nextShards = state.bloomShards + score.bloomShardsGained;
      const nextMoonTokens = state.moonTokens + score.moonTokensGained;

      const base: GameState = {
        ...state,
        pool: nextPool,
        grid: displayedGrid,
        orbs: nextOrbs,
        embers: nextEmbers,
        bloomShards: nextShards,
        moonTokens: nextMoonTokens,
        lastScore: score.orbs,
        lastRewards: {
          embers: score.embersGained,
          bloomShards: score.bloomShardsGained,
          moonTokens: score.moonTokensGained,
        },
        lastEvents: events,
        contributingCells: score.contributingCells,
        appearanceCounts: score.appearanceCountsNext,
        totalSpins: state.totalSpins + 1,
        alternatingTick: !state.alternatingTick,
        spinInCycle: nextSpin,
        // Default: every spin opens a draft offer immediately.
        phase: { kind: "draft", offers: pickDraft(DRAFT_POOL) },
      };

      // Tithe check on the 8th spin of a cycle.
      if (nextSpin >= TITHE_INTERVAL) {
        const required = TITHE_REQUIREMENTS[state.titheRound];
        if (nextOrbs >= required) {
          const newRound = state.titheRound + 1;
          if (newRound >= TITHE_REQUIREMENTS.length) {
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
      return base;
    }
    case "ACK_TITHE_PASS": {
      // Reset cycle, pay ember reward, then surface this spin's draft offer.
      return {
        ...state,
        orbs: 0,
        embers: state.embers + EMBERS_PER_TITHE,
        spinInCycle: 0,
        titheRound: state.titheRound + 1,
        phase: { kind: "draft", offers: pickDraft(DRAFT_POOL) },
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
  const [floatScore, setFloatScore] = useState<{ value: number; key: number } | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
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

  // Show floating "+N orbs" when a spin resolves.
  useEffect(() => {
    if (state.lastScore > 0 && (state.phase.kind === "draft" || state.phase.kind === "tithe-passed")) {
      setFloatScore({ value: state.lastScore, key: Date.now() });
      const t = setTimeout(() => setFloatScore(null), 1400);
      return () => clearTimeout(t);
    }
  }, [state.phase.kind, state.lastScore]);

  const titheRequired = TITHE_REQUIREMENTS[state.titheRound] ?? 0;
  const spinsLeft = Math.max(0, TITHE_INTERVAL - state.spinInCycle);
  const titheWarning = state.titheRound < TITHE_REQUIREMENTS.length && spinsLeft <= 2 && state.phase.kind !== "spinning";

  const canSpin = state.embers > 0 && state.phase.kind === "idle";

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
    <div className="midsummer-root" onClick={() => setTooltip(null)}>
      {/* Forest backdrop */}
      <div
        className="midsummer-bg"
        style={{ backgroundImage: `url(${backgroundAsset.url})` }}
        aria-hidden
      />
      <div className="midsummer-vignette" aria-hidden />

      <main className="midsummer-stage" onClick={(e) => e.stopPropagation()}>
        <Header
          embers={state.embers}
          orbs={state.orbs}
          shards={state.bloomShards}
          moonTokens={state.moonTokens}
          titheRequired={titheRequired}
          spinInCycle={state.spinInCycle}
          titheRound={state.titheRound}
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
            if (!hasSymbol) { setTooltip(null); return; }
            setTooltip((cur) =>
              cur && cur.kind === "cell" && cur.index === idx ? null : { kind: "cell", index: idx },
            );
          }}
          onChipClick={onTooltipChip}
          acornCountdown={Math.max(0, 5 - (minAgeById["acorn"] ?? 0))}
        />

        <SpinLog
          events={state.lastEvents}
          orbs={state.lastScore}
          rewards={state.lastRewards}
          totalSpins={state.totalSpins}
        />

        <SpinBar
          canSpin={canSpin}
          embers={state.embers}
          onSpin={onSpin}
          spinning={state.phase.kind === "spinning"}
          floatScore={floatScore}
          pool={state.pool}
          onViewPool={() => setPoolOpen(true)}
        />
      </main>

      {/* Overlays */}
      {poolOpen && (
        <Overlay>
          <h2 className="overlay-title">Your symbol pool</h2>
          <p className="overlay-sub">
            {state.pool.length} symbol{state.pool.length === 1 ? "" : "s"} in your bag.
            One of each lands on the grid every spin.
          </p>
          <div className="pool-grid">
            {poolCounts(state.pool).map(([id, count]) => {
              const def = SYMBOLS[id];
              const isHi = highlightedMembers.includes(id);
              const open = tooltip && tooltip.kind === "pool" && tooltip.id === id;
              return (
                <div
                  key={id}
                  className={`pool-grid-chip ${isHi ? "cell-grouped" : ""} ${open ? "tip-open" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
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
          <button className="primary-btn" onClick={() => { setPoolOpen(false); setTooltip(null); }}>Close</button>
        </Overlay>
      )}

      {state.phase.kind === "tithe-passed" && (
        <Overlay>
          <h2 className="overlay-title">Tithe paid</h2>
          <p className="overlay-sub">
            Round {state.phase.round} of {TITHE_REQUIREMENTS.length} cleared.
            <br />+{EMBERS_PER_TITHE} Embers granted.
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

      {state.phase.kind === "draft" && (
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
                  <div className="draft-desc">{def.description}</div>
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
          <button className="ghost-btn" onClick={() => dispatch({ type: "SKIP_DRAFT" })}>
            Skip — keep pool lean
          </button>
        </Overlay>
      )}

      {state.phase.kind === "tithe-failed" && (
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

      {state.phase.kind === "win" && (
        <Overlay>
          <img src={crownAsset.url} alt="" className="pixelart crown" />
          <h2 className="overlay-title">Crowned of Midsummer</h2>
          <p className="overlay-sub">All three tithes paid. The wood remembers your name.</p>
          <button className="primary-btn" onClick={() => dispatch({ type: "RESTART" })}>
            New run
          </button>
        </Overlay>
      )}

      {/* Out of embers without a passing orb count = loss too */}
      {state.phase.kind !== "spinning" &&
        state.phase.kind !== "tithe-failed" &&
        state.phase.kind !== "win" &&
        state.phase.kind !== "tithe-passed" &&
        state.phase.kind !== "draft" &&
        state.phase.kind !== "green-man-upgrade" &&
        state.embers === 0 &&
        state.orbs < titheRequired && (
          <Overlay>
            <h2 className="overlay-title">Out of embers</h2>
            <p className="overlay-sub">The flame is cold. The tithe will not be paid.</p>
            <button className="primary-btn" onClick={() => dispatch({ type: "RESTART" })}>
              Try again
            </button>
          </Overlay>
        )}
    </div>
  );
}

// -------- Subcomponents ----------------------------------------------------

function Header(props: {
  embers: number;
  orbs: number;
  shards: number;
  moonTokens: number;
  titheRequired: number;
  spinInCycle: number;
  titheRound: number;
}) {
  const totalRounds = TITHE_REQUIREMENTS.length;
  return (
    <header className="hud">
      <div className="hud-row">
        <Stat icon={<img src={flameAsset.url} alt="" className="pixelart hud-icon" />} value={props.embers} label="Embers" />
        <Stat icon={<img src={orbImg} alt="" className="pixelart hud-icon" />} value={props.orbs} label="Light Orbs" />
        <Stat icon={<span className="hud-shard">◆</span>} value={props.shards} label="Bloom" />
        <Stat icon={<span className="hud-moon">☾</span>} value={props.moonTokens} label="Moon Tokens" />
      </div>
      <div className="hud-tithe">
        <span>Spin {Math.min(props.spinInCycle + 1, TITHE_INTERVAL)} / {TITHE_INTERVAL}</span>
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
  spinsPerCycle?: number;
}) {
  const perCycle = props.spinsPerCycle ?? 8;
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
  acornCountdown: number;
  titheRound: number;
  orbs: number;
  titheRequirement: number;
  spinsTaken: number;
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
      {import.meta.env.DEV && (
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
    </div>
  );
}

function SpinBar(props: {
  canSpin: boolean;
  embers: number;
  onSpin: () => void;
  spinning: boolean;
  floatScore: { value: number; key: number } | null;
  pool: PoolTile[];
  onViewPool: () => void;
}) {
  return (
    <div className="spin-bar">
      <button className="view-pool-btn" onClick={props.onViewPool}>
        View pool ({props.pool.length})
      </button>
      <div className="spin-button-wrap">
        {props.floatScore && (
          <div key={props.floatScore.key} className="float-score">
            +{props.floatScore.value}
            <img src={orbImg} alt="" className="pixelart float-orb" />
          </div>
        )}
        <button
          className="spin-btn"
          onClick={props.onSpin}
          disabled={!props.canSpin}
        >
          {props.spinning ? "Spinning…" : "Spin"}
          <span className="spin-cost">
            −1 <img src={flameAsset.url} alt="" className="pixelart spin-cost-icon" />
          </span>
        </button>
      </div>
    </div>
  );
}

function Overlay(props: { children: React.ReactNode }) {
  return (
    <div className="overlay animate-fade-in">
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
      <div className="symbol-tip-desc">{def.description}</div>
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
  rewards: { embers: number; bloomShards: number; moonTokens: number };
  totalSpins: number;
}) {
  const [open, setOpen] = useState(true);

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

  return (
    <section className={`spin-log ${open ? "" : "collapsed"}`}>
      <button type="button" className="spin-log-head" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <span className="spin-log-title">
          {props.totalSpins === 0 ? "Spin to begin — synergies will appear here" : `Last spin: +${props.orbs} ◐`}
        </span>
        <span className="spin-log-rewards">
          {props.rewards.bloomShards > 0 && <span>+{props.rewards.bloomShards} ◆</span>}
          {props.rewards.moonTokens > 0 && <span>+{props.rewards.moonTokens} ☾</span>}
          {props.rewards.embers > 0 && <span>+{props.rewards.embers} 🔥</span>}
        </span>
        <span className="spin-log-toggle">{open ? "▾" : "▸"}</span>
      </button>
      {open && groups.length > 0 && (
        <div className="spin-log-body">
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
                                {ev.rewardKind === "bloom_shard" ? "◆"
                                  : ev.rewardKind === "moon_token" ? "☾"
                                  : ev.rewardKind === "embers" ? "🔥"
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