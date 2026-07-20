import type { CombatStance } from "./types";

export type StancePolicy = {
  lowCostReserve: number;
  highCostReserve: number;
  scoreModifier: number;
  emergencyOverridesReserve: boolean;
};

export const stancePolicies: Record<CombatStance, StancePolicy> = {
  aggressive: { lowCostReserve: 0, highCostReserve: 0, scoreModifier: 12, emergencyOverridesReserve: true },
  balanced: { lowCostReserve: 10, highCostReserve: 25, scoreModifier: 0, emergencyOverridesReserve: true },
  defensive: { lowCostReserve: 25, highCostReserve: 55, scoreModifier: -8, emergencyOverridesReserve: true },
};
