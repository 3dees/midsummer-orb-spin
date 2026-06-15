// Simulation: verify pickDraft rarity distribution matches season thresholds.
// Run with: bun scripts/pickDraftDistribution.ts

import { pickDraft } from "../src/lib/midsummer/engine";
import { DRAFT_POOL, SYMBOLS } from "../src/lib/midsummer/symbols";

const TRIALS = 20000;
const TOLERANCE = 0.01; // 1 percentage point

const EXPECTED: Record<number, { common: number; uncommon: number; rare: number }> = {
  0: { common: 0.65, uncommon: 0.35, rare: 0.0 },
  3: { common: 0.64, uncommon: 0.30, rare: 0.06 },
  6: { common: 0.57, uncommon: 0.29, rare: 0.14 },
  9: { common: 0.51, uncommon: 0.29, rare: 0.20 },
};

let failed = 0;
for (const [titheStr, expected] of Object.entries(EXPECTED)) {
  const tithe = Number(titheStr);
  const counts = { common: 0, uncommon: 0, rare: 0 };
  let total = 0;
  for (let i = 0; i < TRIALS; i++) {
    const offers = pickDraft(DRAFT_POOL, tithe);
    for (const id of offers) {
      const r = SYMBOLS[id].rarity as "common" | "uncommon" | "rare";
      counts[r]++;
      total++;
    }
  }
  const observed = {
    common: counts.common / total,
    uncommon: counts.uncommon / total,
    rare: counts.rare / total,
  };
  console.log(`tithe ${tithe}:`);
  for (const k of ["common", "uncommon", "rare"] as const) {
    const diff = observed[k] - expected[k];
    const ok = Math.abs(diff) <= TOLERANCE;
    if (!ok) failed++;
    console.log(
      `  ${k.padEnd(8)} expected ${expected[k].toFixed(3)}  observed ${observed[k].toFixed(3)}  diff ${diff.toFixed(3)}  ${ok ? "ok" : "FAIL"}`,
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} bucket(s) outside tolerance ±${TOLERANCE}`);
  process.exit(1);
}
console.log("\nAll rarity buckets within tolerance.");