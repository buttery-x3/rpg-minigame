import type { CombatStance } from "./types";

export type StancePolicy = {
  energyReserve: number;
  allowUnlimitedPursuit: boolean;
  formationTether: number;
  emergencyOverridesReserve: boolean;
};

export const stancePolicies: Record<CombatStance, StancePolicy> = {
  aggressive: { energyReserve: 0, allowUnlimitedPursuit: true, formationTether: Number.POSITIVE_INFINITY, emergencyOverridesReserve: true },
  balanced: { energyReserve: 25, allowUnlimitedPursuit: true, formationTether: Number.POSITIVE_INFINITY, emergencyOverridesReserve: true },
  defensive: { energyReserve: 55, allowUnlimitedPursuit: false, formationTether: 6, emergencyOverridesReserve: true },
};
