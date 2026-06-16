// Central feature flags. Flip to true to enable the corresponding UI/logic.
// Items and Essences are stubbed for the future; the bag/inventory UI shows
// dimmed "Coming soon" placeholders while these are false.
export const FEATURES = {
  items: false,
  essences: false,
} as const;

export type FeatureFlag = keyof typeof FEATURES;