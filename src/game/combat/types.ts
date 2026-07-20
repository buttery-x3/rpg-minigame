export type CombatFaction = string;
export type CombatStance = "aggressive" | "balanced" | "defensive";
export type CombatRole = "tank" | "melee" | "ranged" | "healer";
export type CombatController = "human" | "computer";
export type AutoAttackKind = "sword" | "wand";
export type Vec2 = { x: number; z: number };

export type UnitStats = {
  stamina: number;
  strength: number;
  agility: number;
  intelligence: number;
  wisdom: number;
  awareness: number;
};

export type AbilityId =
  | "tank-threat-shout"
  | "tank-taunt"
  | "melee-fan-of-knives"
  | "melee-backstab"
  | "ranged-fireball"
  | "ranged-meteor"
  | "healer-heal"
  | "healer-healing-circle";

export type UnitAction = "idle" | "pursuing" | "attacking" | "casting" | "channeling" | "returning" | "dead";

export type CombatUnit = {
  id: string;
  name: string;
  ownerId: string;
  faction: CombatFaction;
  role: CombatRole;
  groupId: string;
  position: Vec2;
  home: Vec2;
  facing: Vec2;
  stats: UnitStats;
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  threat: number;
  alive: boolean;
  targetId: string | null;
  forcedTargetId: string | null;
  forcedTargetRemaining: number;
  action: UnitAction;
  attackRemaining: number;
  cooldowns: Partial<Record<AbilityId, number>>;
  abilities: AbilityId[];
  cast: { abilityId: AbilityId; targetId: string | null; position: Vec2; remaining: number } | null;
  channel: { abilityId: "healer-healing-circle"; position: Vec2; remaining: number; tickRemaining: number; ticksApplied: number } | null;
};

export type CombatGroup = {
  id: string;
  ownerId: string;
  faction: CombatFaction;
  controller: CombatController;
  stance: CombatStance;
  recalled: boolean;
  engagedFactionIds: CombatFaction[];
  anchor: Vec2;
  moveTarget: Vec2 | null;
};

export type CombatCommand =
  | { type: "move"; groupId: string; ownerId: string; position: Vec2 }
  | { type: "set-stance"; groupId: string; ownerId: string; stance: CombatStance }
  | { type: "recall"; groupId: string; ownerId: string };

type EventBase = { tick: number };

export type CombatEvent =
  | (EventBase & { type: "cast-started"; sourceId: string; abilityId: AbilityId; targetId: string | null; sourcePosition: Vec2; targetPosition: Vec2; duration: number })
  | (EventBase & { type: "action-interrupted"; unitId: string; abilityId: AbilityId | null; position: Vec2; reason: "taunted" | "recalled" | "invalid-target" | "dead" })
  | (EventBase & { type: "auto-attack"; sourceId: string; targetId: string; kind: AutoAttackKind; sourcePosition: Vec2; targetPosition: Vec2; duration: number })
  | (EventBase & { type: "projectile-launched"; sourceId: string; targetId: string | null; abilityId: AbilityId | null; kind: "fireball" | "meteor" | "wand"; sourcePosition: Vec2; targetPosition: Vec2; duration: number })
  | (EventBase & { type: "ability-impact"; sourceId: string; abilityId: AbilityId; position: Vec2; radius: number })
  | (EventBase & { type: "channel-started" | "channel-tick" | "channel-ended"; sourceId: string; abilityId: "healer-healing-circle"; position: Vec2; radius: number })
  | (EventBase & { type: "teleport"; unitId: string; abilityId: "melee-backstab"; from: Vec2; to: Vec2 })
  | (EventBase & { type: "damage"; sourceId: string; targetId: string; amount: number; sourcePosition: Vec2; targetPosition: Vec2; abilityId: AbilityId | null })
  | (EventBase & { type: "heal"; sourceId: string; targetId: string; amount: number; sourcePosition: Vec2; targetPosition: Vec2; abilityId: AbilityId })
  | (EventBase & { type: "taunt"; sourceId: string; targetId: string; sourcePosition: Vec2; targetPosition: Vec2; duration: number })
  | (EventBase & { type: "death"; unitId: string; position: Vec2 });
