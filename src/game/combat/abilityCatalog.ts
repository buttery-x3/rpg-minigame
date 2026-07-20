import type { AbilityId, CombatRole } from "./types";

export type AbilityBehavior =
  | "threat-boost"
  | "taunt"
  | "area-damage"
  | "backstab"
  | "projectile-damage"
  | "area-projectile-damage"
  | "single-heal"
  | "healing-circle";

export type AbilityDefinition = {
  id: AbilityId;
  label: string;
  costTier: "low" | "high";
  energyCost: number;
  cooldownSeconds: number;
  castTime: number;
  maximumRange: number;
  radius: number;
  baseThreat: number;
  behavior: AbilityBehavior;
  channelDuration?: number;
  tickInterval?: number;
};

export const abilityCatalog: Record<AbilityId, AbilityDefinition> = {
  "tank-threat-shout": { id: "tank-threat-shout", label: "Threat Shout", costTier: "low", energyCost: 25, cooldownSeconds: 8, castTime: 0.35, maximumRange: 0, radius: 3.5, baseThreat: 35, behavior: "threat-boost" },
  "tank-taunt": { id: "tank-taunt", label: "Taunt", costTier: "high", energyCost: 65, cooldownSeconds: 12, castTime: 0.1, maximumRange: 10, radius: 0, baseThreat: 8, behavior: "taunt" },
  "melee-fan-of-knives": { id: "melee-fan-of-knives", label: "Fan of Knives", costTier: "low", energyCost: 25, cooldownSeconds: 7, castTime: 0.3, maximumRange: 0, radius: 3, baseThreat: 4, behavior: "area-damage" },
  "melee-backstab": { id: "melee-backstab", label: "Backstab", costTier: "high", energyCost: 65, cooldownSeconds: 13, castTime: 0.3, maximumRange: 8, radius: 0, baseThreat: 8, behavior: "backstab" },
  "ranged-fireball": { id: "ranged-fireball", label: "Fireball", costTier: "low", energyCost: 25, cooldownSeconds: 6, castTime: 0.7, maximumRange: 10, radius: 0, baseThreat: 4, behavior: "projectile-damage" },
  "ranged-meteor": { id: "ranged-meteor", label: "Meteor", costTier: "high", energyCost: 65, cooldownSeconds: 18, castTime: 1.35, maximumRange: 12, radius: 4, baseThreat: 8, behavior: "area-projectile-damage" },
  "healer-heal": { id: "healer-heal", label: "Heal", costTier: "low", energyCost: 25, cooldownSeconds: 6, castTime: 0.85, maximumRange: 10, radius: 0, baseThreat: 4, behavior: "single-heal" },
  "healer-healing-circle": { id: "healer-healing-circle", label: "Healing Circle", costTier: "high", energyCost: 65, cooldownSeconds: 14, castTime: 0.35, maximumRange: 10, radius: 4, baseThreat: 8, behavior: "healing-circle", channelDuration: 5, tickInterval: 1 },
};

export const starterAbilityLoadouts: Record<CombatRole, AbilityId[]> = {
  tank: ["tank-threat-shout", "tank-taunt"],
  melee: ["melee-fan-of-knives", "melee-backstab"],
  ranged: ["ranged-fireball", "ranged-meteor"],
  healer: ["healer-heal", "healer-healing-circle"],
};
