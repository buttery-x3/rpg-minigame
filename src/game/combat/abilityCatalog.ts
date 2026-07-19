import type { AbilityId, CombatRole } from "./types";

export type AbilityDefinition = {
  id: AbilityId;
  label: string;
  energyCost: number;
  cooldownSeconds: number;
  highCost: boolean;
};

export const abilityCatalog: Record<AbilityId, AbilityDefinition> = {
  "tank-threat-shout": { id: "tank-threat-shout", label: "Threat Shout", energyCost: 25, cooldownSeconds: 6, highCost: false },
  "tank-taunt": { id: "tank-taunt", label: "Taunt", energyCost: 65, cooldownSeconds: 12, highCost: true },
  "melee-fan-of-knives": { id: "melee-fan-of-knives", label: "Fan of Knives", energyCost: 25, cooldownSeconds: 5, highCost: false },
  "melee-backstab": { id: "melee-backstab", label: "Backstab", energyCost: 65, cooldownSeconds: 10, highCost: true },
  "ranged-fireball": { id: "ranged-fireball", label: "Fireball", energyCost: 25, cooldownSeconds: 4, highCost: false },
  "ranged-meteor": { id: "ranged-meteor", label: "Meteor", energyCost: 65, cooldownSeconds: 14, highCost: true },
  "healer-heal": { id: "healer-heal", label: "Heal", energyCost: 25, cooldownSeconds: 4, highCost: false },
  "healer-healing-circle": { id: "healer-healing-circle", label: "Healing Circle", energyCost: 65, cooldownSeconds: 14, highCost: true },
};

export const starterAbilityLoadouts: Record<CombatRole, AbilityId[]> = {
  tank: ["tank-threat-shout", "tank-taunt"],
  melee: ["melee-fan-of-knives", "melee-backstab"],
  ranged: ["ranged-fireball", "ranged-meteor"],
  healer: ["healer-heal", "healer-healing-circle"],
};
