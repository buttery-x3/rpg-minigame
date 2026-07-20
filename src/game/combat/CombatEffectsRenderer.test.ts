import { describe, expect, it } from "vitest";
import { CombatEffectsRenderer } from "./CombatEffectsRenderer";
import type { CombatEvent, Vec2 } from "./types";

const source: Vec2 = { x: 0, z: 0 };
const target: Vec2 = { x: 4, z: 0 };

describe("CombatEffectsRenderer", () => {
  it("maps phased combat events to persistent and transient presentation effects", () => {
    const renderer = new CombatEffectsRenderer();
    const events: CombatEvent[] = [
      { tick: 1, type: "cast-started", sourceId: "mage", abilityId: "ranged-fireball", targetId: "enemy", sourcePosition: source, targetPosition: target, duration: 0.35 },
      { tick: 2, type: "auto-attack", sourceId: "rogue", targetId: "enemy", kind: "sword", sourcePosition: source, targetPosition: target, duration: 0.18 },
      { tick: 3, type: "projectile-launched", sourceId: "mage", targetId: "enemy", abilityId: "ranged-fireball", kind: "fireball", sourcePosition: source, targetPosition: target, duration: 0.35 },
      { tick: 4, type: "projectile-launched", sourceId: "healer", targetId: "enemy", abilityId: null, kind: "wand", sourcePosition: source, targetPosition: target, duration: 0.3 },
      { tick: 5, type: "projectile-launched", sourceId: "mage", targetId: null, abilityId: "ranged-meteor", kind: "meteor", sourcePosition: source, targetPosition: target, duration: 0.65 },
      { tick: 6, type: "ability-impact", sourceId: "tank", abilityId: "tank-threat-shout", position: source, radius: 3.5 },
      { tick: 7, type: "ability-impact", sourceId: "rogue", abilityId: "melee-fan-of-knives", position: source, radius: 3 },
      { tick: 8, type: "ability-impact", sourceId: "mage", abilityId: "ranged-meteor", position: target, radius: 4 },
      { tick: 9, type: "channel-started", sourceId: "healer", abilityId: "healer-healing-circle", position: source, radius: 4 },
      { tick: 10, type: "channel-tick", sourceId: "healer", abilityId: "healer-healing-circle", position: source, radius: 4 },
      { tick: 11, type: "teleport", unitId: "rogue", abilityId: "melee-backstab", from: source, to: target },
      { tick: 12, type: "taunt", sourceId: "tank", targetId: "enemy", sourcePosition: source, targetPosition: target, duration: 5 },
      { tick: 13, type: "heal", sourceId: "healer", targetId: "tank", amount: 20, sourcePosition: source, targetPosition: target, abilityId: "healer-heal" },
      { tick: 14, type: "damage", sourceId: "mage", targetId: "enemy", amount: 30, sourcePosition: source, targetPosition: target, abilityId: "ranged-fireball" },
      { tick: 15, type: "action-interrupted", unitId: "enemy", abilityId: "ranged-fireball", position: target, reason: "taunted" },
      { tick: 16, type: "death", unitId: "enemy", position: target },
      { tick: 17, type: "channel-ended", sourceId: "healer", abilityId: "healer-healing-circle", position: source, radius: 4 },
    ];

    renderer.consume(events);
    expect(renderer.activeCount).toBeGreaterThan(12);
    expect(renderer.totalCreated).toBeGreaterThan(events.length);
    for (let index = 0; index < 70; index += 1) renderer.update(0.1);
    expect(renderer.activeCount).toBe(0);
    renderer.dispose();
  });
});
