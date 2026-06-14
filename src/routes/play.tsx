import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import backgroundAsset from "@/assets/background.png.asset.json";
import flameAsset from "@/assets/sprites/flame.png.asset.json";
import crownAsset from "@/assets/sprites/crown.png.asset.json";
import orbImg from "@/assets/sprites/orb.png";

import {
  DRAFT_POOL,
  STARTING_POOL,
  SYMBOLS,
  type SymbolId,
} from "@/lib/midsummer/symbols";
import {
  EMBERS_PER_TITHE,
  GRID_COLS,
  GRID_ROWS,
  GRID_SIZE,
  START_EMBERS,
  TITHE_INTERVAL,
  TITHE_REQUIREMENTS,
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
  | { kind: "win" }
  | { kind: "loss" };

interface GameState {
  embers: number;
  orbs: number; // banked towards tithe
  bloomShards: number;
  moonTokens: number;
  pool: SymbolId[];
  grid: (SymbolId | null)[];
  spinInCycle: number; // 0..TITHE_INTERVAL
  titheRound: number; // 0..TITHE_REQUIREMENTS.length
  totalSpins: number;
  alternatingTick: boolean;
  destroyedThisRun: number;
  appearanceCounts: Record<string, number>;
  lastScore: number;
  contributingCells: Set<number>;
  phase: Phase;
}

function initialState(): GameState {
  return {
    embers: START_EMBERS,
    orbs: 0,
    bloomShards: 0,
    moonTokens: 0,
    pool: [...STARTING_POOL],
    grid: rollGrid(STARTING_POOL),
    spinInCycle: 0,
    titheRound: 0,
    totalSpins: 0,
    alternatingTick: false,
    destroyedThisRun: 0,
    appearanceCounts: {},
    lastScore: 0,
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
      const nextSpin = state.spinInCycle + 1;
      const nextOrbs = state.orbs + score.orbs;
      const nextEmbers = state.embers + score.embersGained;
      const nextShards = state.bloomShards + score.bloomShardsGained;
      const nextMoonTokens = state.moonTokens + score.moonTokensGained;

      const base: GameState = {
        ...state,
        grid: finalGrid,
        orbs: nextOrbs,
        embers: nextEmbers,
        bloomShards: nextShards,
        moonTokens: nextMoonTokens,
        lastScore: score.orbs,
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
      // Add the new symbol instance to the pool permanently AND immediately
      // re-roll the grid so the player can see it placed before their next
      // spin. Future versions will let the player spend tokens here to
      // remove symbols from their pool before committing the spin.
      const nextPool = [...state.pool, action.id];
      return {
        ...state,
        pool: nextPool,
        grid: rollGrid(nextPool),
        contributingCells: new Set(),
        phase: { kind: "idle" },
      };
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
    dispatch({ type: "BEGIN_SPIN" });
  }, []);

  return (
    <div className="midsummer-root">
      {/* Forest backdrop */}
      <div
        className="midsummer-bg"
        style={{ backgroundImage: `url(${backgroundAsset.url})` }}
        aria-hidden
      />
      <div className="midsummer-vignette" aria-hidden />

      <main className="midsummer-stage">
        <Header
          embers={state.embers}
          orbs={state.orbs}
          shards={state.bloomShards}
          titheRequired={titheRequired}
          spinInCycle={state.spinInCycle}
          titheRound={state.titheRound}
        />

        {titheWarning && (
          <div className="tithe-warning animate-fade-in">
            <span>🔔</span> Tithe in {spinsLeft || "now"} — need {titheRequired} orbs
          </div>
        )}

        <SlotFrame
          grid={state.grid}
          contributing={state.contributingCells}
          spinning={state.phase.kind === "spinning"}
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
              return (
                <div key={id} className="pool-grid-chip" title={def.description}>
                  <img src={def.sprite} alt={def.name} className="pixelart" />
                  <span className="pool-grid-count">×{count}</span>
                  <span className="pool-grid-name">{def.name}</span>
                </div>
              );
            })}
          </div>
          <button className="primary-btn" onClick={() => setPoolOpen(false)}>Close</button>
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
              return (
                <button
                  key={id}
                  className="draft-card"
                  onClick={() => dispatch({ type: "PICK_DRAFT", id })}
                >
                  <img src={def.sprite} alt={def.name} className="pixelart" />
                  <div className="draft-name">{def.name}</div>
                  <div className="draft-desc">{def.description}</div>
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

function SlotFrame(props: {
  grid: (SymbolId | null)[];
  contributing: Set<number>;
  spinning: boolean;
}) {
  return (
    <div className="slot-frame">
      <div className="slot-grid">
        {props.grid.map((id, i) => {
          if (id == null) {
            return <div key={i} className="cell cell-empty" aria-hidden />;
          }
          const def = SYMBOLS[id];
          const isHot = props.contributing.has(i) && !props.spinning;
          return (
            <div key={i} className={`cell ${isHot ? "cell-hot" : ""}`}>
              <img
                key={`${id}-${i}-${props.spinning ? "s" : "r"}`}
                src={def.sprite}
                alt={def.name}
                className={`pixelart cell-sprite ${props.spinning ? "spinning" : "settled"}`}
                style={{ animationDelay: `${(i % GRID_COLS) * 40}ms` }}
              />
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
  pool: SymbolId[];
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