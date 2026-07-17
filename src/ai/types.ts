// B6 — types shared across the AI narrative pipeline.

// The structured output Gemini must return (enforced via responseSchema).
export interface ForensicNarratives {
  repairability: {
    summary: string;         // 1–3 short paragraphs for Exhibit F
    matchingFactors: string[]; // bullet points, each grounded in a provided fact
  };
  manufacturer: {
    summary: string;
    productStatement: string; // brand/line + identified/unidentifiable (from input only)
  };
  conclusion: {
    statement: string;    // the signed repairability conclusion for Exhibit M
    basis: string[];      // ordered factual basis: storm, damage, product, code
  };
}

// The compacted, grounding-only facts object passed to the LLM.
// Everything Gemini may reference is here — and ONLY here.
export interface GenerationInput {
  property: {
    address: string;
    dateOfLoss: string | null;
    claimNumber: string | null;
  };
  storm: {
    type: string | null;
    date: string | null;
    magnitude: string | null;
    source: string;
  } | null;
  damage: Array<{
    location: string;
    damageType: string;
    observedIndicators: string[];
    causationNote: string | null;
  }>;
  testSquares: Array<{
    slopeLabel: string;
    hitCount: number;
  }>;
  components: Array<{
    componentType: string;
    status: string;
  }>;
  products: Array<{
    brand: string | null;
    line: string | null;
    unidentifiable: boolean;
    identificationType: string;
    // NOTE: a `discontinued` boolean would be added here once the mobile app
    // captures discontinuation status. Until then the narrative must not assert it.
  }>;
  scope: {
    squares: number;
    subtotal: number;
    currency: string;
    lineItems: Array<{
      description: string;
      quantity: number;
      unit: string;
      codeRefs: string[];
    }>;
  };
  codeProvisions: Array<{
    code: string;
    title: string;
    text: string;
  }>;
}
