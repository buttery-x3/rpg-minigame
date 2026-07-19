import type { CombatRole, UnitStats } from "./types";

export const THREAT_MAX = 100;
export const THREAT_DECAY_PER_SECOND = 5;
export const ENERGY_MAX = 100;

export const roleStats: Record<CombatRole, UnitStats> = {
  tank: { stamina: 12, strength: 8, agility: 4, intelligence: 2, wisdom: 4, awareness: 8 },
  melee: { stamina: 7, strength: 10, agility: 9, intelligence: 2, wisdom: 3, awareness: 6 },
  ranged: { stamina: 5, strength: 2, agility: 6, intelligence: 11, wisdom: 5, awareness: 10 },
  healer: { stamina: 6, strength: 2, agility: 5, intelligence: 6, wisdom: 11, awareness: 8 },
};

export function maxHealth(stats: UnitStats) {
  return 100 + stats.stamina * 10;
}

export function energyRegen(stats: UnitStats) {
  return 8 + stats.wisdom * 0.2;
}

export function awarenessRange(stats: UnitStats) {
  return 6 + stats.awareness * 0.75;
}

export function attackInterval(stats: UnitStats, base: number) {
  return Math.max(0.55, base / (1 + stats.agility * 0.03));
}
