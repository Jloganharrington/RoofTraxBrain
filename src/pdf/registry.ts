import type { ExhibitGenerator } from './exhibit.js';
import { exhibitA } from './exhibits/A_homeowner.js';
import { exhibitB } from './exhibits/B_qualifications.js';
import { exhibitC } from './exhibits/C_methodology.js';
import { exhibitD } from './exhibits/D_storm.js';
import { exhibitE } from './exhibits/E_damage.js';
import { exhibitH } from './exhibits/H_measurements.js';
import { exhibitI } from './exhibits/I_codes.js';
import { exhibitJ } from './exhibits/J_scope.js';
import { exhibitK } from './exhibits/K_adders.js';
import { exhibitL } from './exhibits/L_contract.js';

// Exhibit order for the assembled package.
//   B3 -> A, B, C   ·   B4 -> D, E, H   ·   B5 -> I, J, K, L
// F, G, M (repairability, manufacturer docs, signed conclusion) are the
// judgment-heavy AI exhibits built in B6 — intentionally absent from B0-B5.
export const EXHIBITS: ExhibitGenerator[] = [
  exhibitA,
  exhibitB,
  exhibitC,
  exhibitD,
  exhibitE,
  exhibitH,
  exhibitI,
  exhibitJ,
  exhibitK,
  exhibitL,
];
