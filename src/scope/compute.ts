import type { SubmittedInspection } from '../submissions/types.js';
import type { ResolvedConfig, StatePack } from '../tenancy/types.js';
import type { ScopeLineItem, ScopeResult } from './types.js';
import { measuredSquares, linearTotal } from './measure.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Code provisions (by id) whose `appliesTo` includes a given scope-element key.
function codeRefsFor(elementKey: string, state: StatePack): string[] {
  return state.codeLibrary.filter((c) => c.appliesTo.includes(elementKey)).map((c) => c.id);
}

interface AdderDetection {
  triggered: boolean;
  quantity: number;
  note: string;
}

// Detect whether an adder's documented triggering condition is present in the
// inspection, and derive its quantity from raw captured facts. Adders that are
// jurisdiction/policy-dependent without a captured trigger are NOT auto-added.
function detectAdder(key: string, inspection: SubmittedInspection): AdderDetection {
  const has = (type: string, statuses: string[]): boolean =>
    inspection.components.some((c) => c.componentType === type && statuses.includes(c.status));

  switch (key) {
    case 'drip_edge': {
      const triggered = has('drip_edge', ['absent']);
      const quantity = linearTotal(inspection, 'eave_lf') + linearTotal(inspection, 'rake_lf');
      return { triggered, quantity, note: 'eave + rake linear feet where drip edge is absent' };
    }
    case 'decking': {
      const sheets = inspection.components.filter(
        (c) => c.componentType === 'decking' && ['deteriorated', 'absent'].includes(c.status),
      ).length;
      return {
        triggered: sheets > 0,
        quantity: sheets,
        note: 'documented deteriorated sections; final sheet count confirmed at tear-off',
      };
    }
    case 'steep_high': {
      const steep = inspection.slopes.some((s) => {
        const rise = s.pitch ? Number(s.pitch.split('/')[0]) : NaN;
        return Number.isFinite(rise) && rise > 8;
      });
      return { triggered: steep, quantity: steep ? measuredSquares(inspection) : 0, note: 'pitch exceeds 8/12' };
    }
    // ice_barrier and permit are jurisdiction/policy-dependent — not auto-added
    // without an explicit captured trigger. Left for review/manual inclusion.
    default:
      return { triggered: false, quantity: 0, note: '' };
  }
}

// The code -> scope -> price spine. Fixed incurred-cost only.
export function computeScope(inspection: SubmittedInspection, config: ResolvedConfig): ScopeResult {
  const squares = measuredSquares(inspection);
  const price = config.company.pricing.pricePerSquare;
  const currency = config.company.pricing.currency;
  const lineItems: ScopeLineItem[] = [];

  // Base roof covering.
  lineItems.push({
    key: 'roof_covering',
    description: 'Remove and replace roof covering (incurred cost per square, materials + labor)',
    quantity: squares,
    unit: 'SQ',
    unitPrice: price,
    total: round2(squares * price),
    isAdder: false,
    codeRefs: codeRefsFor('roof_covering', config.state),
  });

  // Conditional adders, each bound to its documented triggering condition.
  for (const rule of config.state.adderRules) {
    const det = detectAdder(rule.key, inspection);
    if (!det.triggered || det.quantity <= 0) continue;
    const rate = config.company.pricing.adderRates[rule.key] ?? 0;
    lineItems.push({
      key: rule.key,
      description: `${rule.label} — ${det.note}`,
      quantity: det.quantity,
      unit: rule.unit,
      unitPrice: rate,
      total: round2(det.quantity * rate),
      isAdder: true,
      triggerCondition: rule.triggerCondition,
      codeRefs: codeRefsFor(rule.key, config.state),
    });
  }

  const subtotal = round2(lineItems.reduce((s, li) => s + li.total, 0));
  return { squares, basePricePerSquare: price, currency, lineItems, subtotal };
}
