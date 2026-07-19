export type CombatFaction = "party" | "enemy";
export type CombatStance = "aggressive" | "balanced" | "defensive";
export type CombatRole = "tank" | "melee" | "ranged" | "healer";
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
  cooldowns: Record<AbilityId, number>;
  abilities: AbilityId[];
  cast: { abilityId: AbilityId; targetId: string | null; position: Vec2; remaining: number } | null;
  channel: { abilityId: AbilityId; position: Vec2; remaining: number; tickRemaining: number } | null;
};

export type CombatGroup = {
  id: string;
  ownerId: string;
  faction: CombatFaction;
  stance: CombatStance;
  recalled: boolean;
  engagedGroupIds: string[];
};

export type CombatEvent =
  | { type: "damage"; sourceId: string; targetId: string; amount: number }
  | { type: "heal"; sourceId: string; targetId: string; amount: number }
  | { type: "cast"; sourceId: string; abilityId: AbilityId; targetId: string | null; position: Vec2 }
  | { type: "taunt"; sourceId: string; targetId: string }
  | { type: "death"; unitId: string };
