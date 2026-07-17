import type { ExhibitGenerator } from './exhibit.js';
import { exhibitA } from './exhibits/A_homeowner.js';
import { exhibitB } from './exhibits/B_qualifications.js';
import { exhibitC } from './exhibits/C_methodology.js';
import { exhibitD } from './exhibits/D_storm.js';
import { exhibitE } from './exhibits/E_damage.js';
import { exhibitF } from './exhibits/F_repairability.js';
import { exhibitG } from './exhibits/G_manufacturer.js';
import { exhibitH } from './exhibits/H_measurements.js';
import { exhibitI } from './exhibits/I_codes.js';
import { exhibitJ } from './exhibits/J_scope.js';
import { exhibitK } from './exhibits/K_adders.js';
import { exhibitL } from './exhibits/L_contract.js';
import { exhibitM } from './exhibits/M_conclusion.js';

// Final exhibit order: A B C D E F G H I J K L M
//   B3 -> A, B, C   ·   B4 -> D, E, H   ·   B5 -> I, J, K, L   ·   B6 -> F, G, M
// F and G are inserted after E (damage); M is last (signed conclusion).
export const EXHIBITS: ExhibitGenerator[] = [
  exhibitA,
  exhibitB,
  exhibitC,
  exhibitD,
  exhibitE,
  exhibitF,
  exhibitG,
  exhibitH,
  exhibitI,
  exhibitJ,
  exhibitK,
  exhibitL,
  exhibitM,
];
