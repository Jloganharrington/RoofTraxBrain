import type { ElevationDirection, Stage } from './stages';
import type { ObservedIndicator } from './indicators';

// Raw capture-completion state for a single inspection. Every field is a plain
// fact — no computed squares/waste/pricing lives here or anywhere in this
// package (that is the Brain's exhibit engine, not the protocol gate).
export interface InspectionProtocolState {
  overviewPhotoCaptured: boolean;
  elevations: Partial<Record<ElevationDirection, { widePhotoCaptured: boolean }>>;
  roofAccessPhotoCaptured: boolean;
  slopes: Array<{ id: string; widePhotoCaptured: boolean }>;
  testSquares: Array<{
    id: string;
    slopeId: string;
    overviewPhotoCaptured: boolean;
    hitCount: number;
  }>;
  inaccessibleSlopeIds: string[];
  damageInstances: Array<{
    id: string;
    widePhotoCaptured: boolean;
    midPhotoCaptured: boolean;
    closePhotoCaptured: boolean;
  }>;
  interiorPhotoCaptured: boolean;
  interiorObservationCount: number;
  interiorClaimWaived: boolean;
  productIdentifications: Array<{ id: string; unidentifiable: boolean }>;
  measurements: Array<{ id: string; slopeId: string }>;
  attestationRecorded: boolean;
  finalReviewConfirmed: boolean;
  observedIndicators: ObservedIndicator[];
}

export interface Deficiency {
  stage: Stage;
  code: string;
  message: string;
}

export interface SoftFlag {
  stage: Stage;
  code: string;
  message: string;
}

export interface EvaluationResult {
  deficiencies: Deficiency[];
  softFlags: SoftFlag[];
}
