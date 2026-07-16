// Multi-tenant × multi-state config model (B1). Content is owned by exactly one
// scope so nothing is duplicated: company packs travel with the tenant; state
// packs travel with the jurisdiction. An inspection resolves both.

// ----- Company-scoped (travels with the tenant) -----
export interface CompanyPack {
  legalName: string;
  brandName: string;
  logoRef: string | null; // object-storage ref, resolved at render
  letterhead: {
    primaryColorHex: string;
    addressLines: string[];
    phone: string;
    email: string;
    website: string | null;
  };
  licenses: Array<{ state: string; number: string; classification: string }>;
  // Exhibit B — Statement of Qualifications
  qualifications: {
    statement: string;
    experienceYears: number | null;
    certifications: string[];
  };
  // Exhibit J — pricing basis. Fixed $/SQ incurred-cost; NEVER Xactimate/carrier math.
  pricing: {
    pricePerSquare: number;
    currency: string;
    basisStatement: string;
    // Company's own incurred-cost rate per adder key (matches state adder-rule keys).
    adderRates: Record<string, number>;
  };
  // Exhibit L — contract template reference (executed agreement is inspection-scoped)
  contractTemplateRef: string | null;
  // Exhibit C — methodology template (merged with the inspection's auto-logged capture)
  methodologyTemplate: {
    equipmentBaseline: string[];
    testSquareProtocol: string;
    markingStandard: string;
    photoStandard: string;
  };
}

// ----- State-scoped (travels with the jurisdiction) -----
export interface CodeProvision {
  id: string;
  code: string; // e.g. "IRC R908.3"
  edition: string; // adopted edition/amendment
  title: string;
  text: string;
  // Scope-element keys this provision governs (drives Exhibit I cross-reference).
  appliesTo: string[];
}

export interface AdderRule {
  id: string;
  key: string; // scope-element key
  label: string;
  triggerCondition: string; // the documented condition that must be present
  unit: string; // e.g. "LF", "SQ", "EA"
}

export interface StatePack {
  stateCode: string;
  stateName: string;
  // Exhibit A — Homeowner Information (educational; never advice)
  homeownerRights: { title: string; body: string };
  // Closing UPPA disclaimer — statute-cited, per-state, counsel-reviewed before go-live
  uppaDisclaimer: { statuteCitation: string; body: string };
  // Exhibit I — per-state code library, cross-referenced from the scope element
  codeLibrary: CodeProvision[];
  // Exhibit K — conditional adders, each bound to a documented triggering condition
  adderRules: AdderRule[];
}

// Resolved config for a single inspection: exactly one company pack + one state pack.
export interface ResolvedConfig {
  companyId: string;
  company: CompanyPack;
  stateCode: string;
  state: StatePack;
}
