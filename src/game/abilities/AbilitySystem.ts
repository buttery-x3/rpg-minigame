import type { AbilityDefinition, AbilityResult, AbilityTarget } from "./types";
import type { PartyMember } from "../party/PartyMember";

export class AbilitySystem {
  private readonly cooldowns = new Map<string, number>();

  constructor(private readonly getPartyMembers: () => readonly PartyMember[]) {}

  update(dt: number) {
    for (const [key, remaining] of this.cooldowns) {
      const next = Math.max(0, remaining - dt);
      if (next === 0) {
        this.cooldowns.delete(key);
      } else {
        this.cooldowns.set(key, next);
      }
    }
  }

  use(member: PartyMember, ability: AbilityDefinition, target?: AbilityTarget): AbilityResult {
    const key = this.cooldownKey(member, ability);
    const remaining = this.getCooldown(member, ability);
    if (remaining > 0) {
      return {
        success: false,
        message: `${ability.label} is on cooldown`,
        effects: [],
      };
    }

    const result = ability.execute({
      caster: member,
      target,
      partyMembers: this.getPartyMembers(),
    });

    if (result.success) {
      this.cooldowns.set(key, ability.cooldownSeconds);
    }

    return result;
  }

  getCooldown(member: PartyMember, ability: AbilityDefinition) {
    return this.cooldowns.get(this.cooldownKey(member, ability)) ?? 0;
  }

  private cooldownKey(member: PartyMember, ability: AbilityDefinition) {
    return `${member.id}:${ability.id}`;
  }
}
