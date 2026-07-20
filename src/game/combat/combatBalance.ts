import type { CombatRole, UnitStats } from "./types";

export const THREAT_MAX = 100;
export const THREAT_DECAY_PER_SECOND = 5;
export const ENERGY_MAX = 100;
export const TAUNT_DURATION_SECONDS = 5;
export const MELEE_AUTO_ATTACK_RANGE = 1.8;
export const RANGED_AUTO_ATTACK_RANGE = 9;
export const MOVEMENT_SPEED = 7.4;
export const DAMAGE_THREAT_MULTIPLIER = 0.45;
export const HEALING_THREAT_MULTIPLIER = 0.35;

export const roleStats: Record<CombatRole, UnitStats> = {
  tank: { stamina: 12, strength: 8, agility: 4, intelligence: 2, wisdom: 4, awareness: 8 },
  melee: { stamina: 7, strength: 10, agility: 9, intelligence: 2, wisdom: 3, awareness: 6 },
  ranged: { stamina: 5, strength: 2, agility: 6, intelligence: 11, wisdom: 5, awareness: 10 },
  healer: { stamina: 6, strength: 2, agility: 5, intelligence: 6, wisdom: 11, awareness: 8 },
};

export function maxHealth(stats: UnitStats) {
  return 220 + stats.stamina * 16;
}

export function energyRegen(stats: UnitStats) {
  return 3.5 + stats.wisdom * 0.12;
}

export function awarenessRange(stats: UnitStats) {
  return 5 + stats.awareness * 0.6;
}

export function attackInterval(stats: UnitStats, base: number) {
  return Math.max(1.05, base / (1 + stats.agility * 0.022));
}

export function sanitizeStats(stats: UnitStats): UnitStats {
  return Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, Math.min(30, Math.max(0, Number.isFinite(value) ? value : 0))])) as UnitStats;
}
