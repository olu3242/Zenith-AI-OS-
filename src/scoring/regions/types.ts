export interface RegionControl {
  id: string;
  name: string;
  domain: string;
  mandatory: boolean;
  reference: string;
}

export interface RegionOverlay {
  region: string;
  displayName: string;
  primaryLaw: string;
  effectiveDate: string;
  complianceMultiplier: number;
  controls: RegionControl[];
  weights: Record<string, number>;
  mandatoryGates: string[];
}
