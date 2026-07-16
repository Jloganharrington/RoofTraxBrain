import type { SubmittedInspection } from '../submissions/types.js';

// Shared measurement math — used by Exhibit H and the B5 scope computation so
// both report identical quantities. Raw values come from the field; the Brain
// derives area and squares.

export function totalRoofSqft(inspection: SubmittedInspection): number {
  return inspection.measurements
    .filter((m) => m.measurementType === 'slope_area_sqft')
    .reduce((sum, m) => sum + (Number.isFinite(m.value) ? m.value : 0), 0);
}

export function linearTotal(inspection: SubmittedInspection, measurementType: string): number {
  return inspection.measurements
    .filter((m) => m.measurementType === measurementType)
    .reduce((sum, m) => sum + (Number.isFinite(m.value) ? m.value : 0), 0);
}

// One roofing square = 100 sq ft. Two decimals; no waste factor is applied here
// (waste/starter/ridge are captured as documented line items, not baked in).
export function measuredSquares(inspection: SubmittedInspection): number {
  return Math.round((totalRoofSqft(inspection) / 100) * 100) / 100;
}
