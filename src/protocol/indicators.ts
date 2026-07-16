// Vocabulary of raw, inspector-observed conditions (ported from the field app).
export const OBSERVED_INDICATORS = [
  'hail_hit',
  'wind_crease',
  'granule_loss',
  'mat_exposure',
  'soft_metal_dents',
  'interior_leak_reported',
  'prior_repair_patch',
] as const;
export type ObservedIndicator = (typeof OBSERVED_INDICATORS)[number];
