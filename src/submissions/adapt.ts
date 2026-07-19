// Wire-shape → contract-shape adapter.
//
// The Brain's SubmittedInspection was written against the protocol spec; the
// field app's tables evolved separately. Real payloads therefore use different
// names for the same facts, and omit some the contract assumed. Reading them
// unguarded produced 500s with no indication of which field was at fault.
//
// One place reconciles the two. Rules:
//   - RENAMES are applied silently (materialType → material). Same fact, two names.
//   - DERIVATIONS compute a contract field from what the app does send
//     (pitchRise/pitchRun → "6/12"; hits.length → hitCount).
//   - GENUINELY ABSENT facts stay absent and are reported by the caller, never
//     invented. A proof package must not assert something nobody recorded.
//
// The app is the source of truth. When these disagree, the app is right and
// this adapter changes — not the app.

type Row = Record<string, any>;

const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

// "6/12" from rise+run; null when either is missing rather than a bogus "0/12".
export function formatPitch(rise: unknown, run: unknown): string | null {
  const r = typeof rise === 'number' ? rise : null;
  const n = typeof run === 'number' ? run : null;
  if (r == null || n == null || n === 0) return null;
  return `${r}/${n}`;
}

export interface AdaptResult {
  inspection: Row;
  /** Contract fields the app has no source for — reported, never invented. */
  unmapped: string[];
}

export function adaptSubmittedInspection(raw: Row): AdaptResult {
  const unmapped = new Set<string>();
  const out: Row = { ...raw };

  // ---- slopes: materialType→material, pitchRise/Run→pitch, no direction ----
  out.slopes = arr(raw.slopes).map((s) => {
    if (s.direction == null) unmapped.add('slopes[].direction');
    return {
      ...s,
      material: s.material ?? s.materialType ?? null,
      pitch: s.pitch ?? formatPitch(s.pitchRise, s.pitchRun),
      direction: s.direction ?? null,
    };
  });

  // ---- damageInstances: no observedIndicators, no material; has severity ----
  out.damageInstances = arr(raw.damageInstances).map((d) => {
    if (d.observedIndicators == null) unmapped.add('damageInstances[].observedIndicators');
    return {
      ...d,
      // Absent app-side. Severity is the nearest real observation, so surface
      // it as the single indicator rather than fabricating a list.
      observedIndicators: Array.isArray(d.observedIndicators)
        ? d.observedIndicators
        : d.severity
          ? [String(d.severity)]
          : [],
      material: d.material ?? null,
      causationNote: d.causationNote ?? null,
    };
  });

  // ---- components: notes (plural) app-side ----
  out.components = arr(raw.components).map((c) => ({
    ...c,
    note: c.note ?? c.notes ?? null,
    status: c.status ?? 'not_determined',
  }));

  // ---- penetrations: no count column; each ROW is one penetration ----
  out.penetrations = arr(raw.penetrations).map((p) => ({
    ...p,
    count: typeof p.count === 'number' ? p.count : 1,
  }));

  // ---- products: productLine→line, identificationMethod→identificationType,
  //      unidentifiable is a REASON string app-side, not a boolean ----
  out.products = arr(raw.products).map((p) => ({
    ...p,
    line: p.line ?? p.productLine ?? null,
    identificationType: p.identificationType ?? p.identificationMethod ?? null,
    unidentifiable:
      typeof p.unidentifiable === 'boolean'
        ? p.unidentifiable
        : Boolean(p.unidentifiableReason) || !p.brand,
  }));

  // ---- testSquares: hitCount derived from the attached hits rows ----
  out.testSquares = arr(raw.testSquares).map((ts) => {
    const hits = arr(ts.hits);
    return {
      ...ts,
      hits: hits.map((h) => ({ ...h, classification: h.classification ?? h.hitType ?? null })),
      hitCount: typeof ts.hitCount === 'number' ? ts.hitCount : hits.length,
      inaccessible: ts.inaccessible ?? false,
      inaccessibleReason: ts.inaccessibleReason ?? null,
    };
  });

  // ---- measurements: subjectType/subjectId app-side, slopeId in the contract ----
  out.measurements = arr(raw.measurements).map((m) => ({
    ...m,
    slopeId: m.slopeId ?? (m.subjectType === 'slope' ? (m.subjectId ?? '') : ''),
  }));

  // ---- sidingFacets: `components` is the count app-side ----
  out.sidingFacets = arr(raw.sidingFacets).map((f) => ({
    ...f,
    componentCount:
      typeof f.componentCount === 'number'
        ? f.componentCount
        : typeof f.components === 'number'
          ? f.components
          : arr(f.components).length,
  }));

  // ---- property: carrierName→carrier ----
  // The rest of the block (insuredName/claimNumber/policyNumber/dateOfLoss)
  // already matches; only the carrier is renamed app-side.
  if (raw.property) {
    out.property = {
      ...raw.property,
      carrier: raw.property.carrier ?? raw.property.carrierName ?? null,
    };
  }

  // ---- interiorObservations / elevations: names already match ----
  out.interiorObservations = arr(raw.interiorObservations);
  out.elevations = arr(raw.elevations);

  return { inspection: out, unmapped: [...unmapped] };
}
