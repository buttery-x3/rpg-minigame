import type { CombatSimulation } from "./CombatSimulation";
import type { CombatFaction, CombatStance, UnitAction, Vec2 } from "./types";

type PublicUnitView = {
  id: string;
  faction: CombatFaction;
  position: Vec2;
  alive: boolean;
  action: UnitAction;
};

type OwnedUnitView = PublicUnitView & {
  name: string;
  role: string;
  groupId: string;
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  threat: number;
  abilities: Array<{ id: string; cooldownRemaining: number }>;
};

export type PlayerCombatView = {
  publicUnits: PublicUnitView[];
  ownedUnits: OwnedUnitView[];
  ownedGroups: Array<{ id: string; stance: CombatStance; recalled: boolean; anchor: Vec2; moveTarget: Vec2 | null }>;
};

/**
 * The browser prototype still owns the full local simulation, but all ordinary UI
 * should consume this shape. A server can later send the same filtered payload.
 */
export function buildPlayerView(simulation: CombatSimulation, ownerId: string): PlayerCombatView {
  const publicUnits = [...simulation.units.values()].map((unit) => ({
    id: unit.id,
    faction: unit.faction,
    position: { ...unit.position },
    alive: unit.alive,
    action: unit.action,
  }));
  const ownedUnits = [...simulation.units.values()]
    .filter((unit) => unit.ownerId === ownerId)
    .map((unit) => ({
      ...publicUnits.find((candidate) => candidate.id === unit.id)!,
      name: unit.name,
      role: unit.role,
      groupId: unit.groupId,
      health: unit.health,
      maxHealth: unit.maxHealth,
      energy: unit.energy,
      maxEnergy: unit.maxEnergy,
      threat: unit.threat,
      abilities: unit.abilities.map((id) => ({ id, cooldownRemaining: unit.cooldowns[id] })),
    }));
  return {
    publicUnits,
    ownedUnits,
    ownedGroups: [...simulation.groups.values()]
      .filter((group) => group.ownerId === ownerId)
      .map((group) => ({ id: group.id, stance: group.stance, recalled: group.recalled, anchor: { ...group.anchor }, moveTarget: group.moveTarget ? { ...group.moveTarget } : null })),
  };
}
