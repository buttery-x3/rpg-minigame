import type { AbilityDefinition } from "./types";

export const abilityDefinitions = {
  tankTaunt: {
    id: "tank-taunt",
    label: "Taunt",
    role: "tank",
    cooldownSeconds: 5,
    targetMode: "area",
    execute: ({ caster, target }) => ({
      success: true,
      message: `${caster.displayName} issues an area taunt`,
      effects: [
        {
          type: "area-taunt" as const,
          sourceId: caster.id,
          position: target?.position?.clone() ?? caster.worldPosition,
          radius: 3.5,
        },
      ],
    }),
  } satisfies AbilityDefinition,
  meleeWhirlwind: {
    id: "melee-whirlwind",
    label: "Whirlwind",
    role: "melee",
    cooldownSeconds: 4,
    targetMode: "area",
    execute: ({ caster }) => ({
      success: true,
      message: `${caster.displayName} swings in an area`,
      effects: [
        {
          type: "area-damage" as const,
          sourceId: caster.id,
          position: caster.worldPosition,
          radius: 2.8,
        },
      ],
    }),
  } satisfies AbilityDefinition,
  rangedFireball: {
    id: "ranged-fireball",
    label: "Fireball",
    role: "ranged",
    cooldownSeconds: 2.5,
    targetMode: "ground",
    execute: ({ caster, target }) => {
      if (!target?.position) {
        return { success: false, message: "Fireball needs a ground target", effects: [] };
      }

      return {
        success: true,
        message: `${caster.displayName} launches a fireball`,
        effects: [
          {
            type: "fireball" as const,
            sourceId: caster.id,
            position: target.position.clone(),
            radius: 1.8,
          },
        ],
      };
    },
  } satisfies AbilityDefinition,
  healerHeal: {
    id: "healer-heal",
    label: "Heal",
    role: "healer",
    cooldownSeconds: 3,
    targetMode: "single-ally",
    execute: ({ caster, target }) => {
      if (!target?.member) {
        return { success: false, message: "Heal needs an allied target", effects: [] };
      }

      const amount = Math.min(30, target.member.maxHealth - target.member.health);
      if (amount <= 0) {
        return { success: false, message: `${target.member.displayName} is already at full health`, effects: [] };
      }

      target.member.health += amount;
      return {
        success: true,
        message: `${caster.displayName} heals ${target.member.displayName}`,
        effects: [
          {
            type: "heal" as const,
            sourceId: caster.id,
            targetId: target.member.id,
            amount,
          },
        ],
      };
    },
  } satisfies AbilityDefinition,
} as const;
