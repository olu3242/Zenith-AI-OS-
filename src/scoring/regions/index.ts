import { EU } from './EU.js';
import { US } from './US.js';
import { UK } from './UK.js';
import { SG } from './SG.js';
import { CA } from './CA.js';
import { GLOBAL } from './GLOBAL.js';

export { EU } from './EU.js';
export { US } from './US.js';
export { UK } from './UK.js';
export { SG } from './SG.js';
export { CA } from './CA.js';
export { GLOBAL } from './GLOBAL.js';
export type { RegionOverlay, RegionControl } from './types.js';

export const REGION_OVERLAYS: Record<string, import('./types.js').RegionOverlay> = {
  EU,
  US,
  UK,
  SG,
  CA,
  GLOBAL,
};

export const SUPPORTED_REGIONS = Object.keys(REGION_OVERLAYS) as Array<keyof typeof REGION_OVERLAYS>;
