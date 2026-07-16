// Scope of work + pricing (computed by B5 from raw measurements + tenant $/SQ +
// state adder rules). Fixed incurred-cost only — never carrier/Xactimate math.

export interface ScopeLineItem {
  key: string; // scope-element key (e.g. "roof_covering", "drip_edge")
  description: string;
  quantity: number;
  unit: string; // SQ, LF, EA, SHEET, ...
  unitPrice: number;
  total: number;
  isAdder: boolean;
  triggerCondition?: string; // for conditional adders (Exhibit K)
  codeRefs: string[]; // code-provision ids governing this element (Exhibit I)
}

export interface ScopeResult {
  squares: number; // roof squares derived from measurements
  basePricePerSquare: number;
  currency: string;
  lineItems: ScopeLineItem[];
  subtotal: number;
}
