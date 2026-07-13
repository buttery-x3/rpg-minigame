import type * as THREE from "three";
import type { PartyRole } from "../../types";
import type { PartyMember } from "../party/PartyMember";

export type AbilityTargetMode = "area" | "ground" | "single-ally";

export type AbilityTarget = {
  position?: THREE.Vector3;
  member?: PartyMember;
};

export type AbilityEffect =
  | {
      type: "area-taunt" | "area-damage" | "fireball";
      sourceId: string;
      position: THREE.Vector3;
      radius: number;
    }
  | {
      type: "heal";
      sourceId: string;
      targetId: string;
      amount: number;
    };

export type AbilityResult = {
  success: boolean;
  message: string;
  effects: AbilityEffect[];
};

export type AbilityContext = {
  caster: PartyMember;
  target: AbilityTarget | undefined;
  partyMembers: readonly PartyMember[];
};

export type AbilityDefinition = {
  id: string;
  label: string;
  role: PartyRole;
  cooldownSeconds: number;
  targetMode: AbilityTargetMode;
  execute: (context: AbilityContext) => AbilityResult;
};
