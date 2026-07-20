import { describe, expect, it } from "vitest";
import { CombatSimulation } from "./CombatSimulation";
import { roleStats } from "./combatBalance";
import { buildPlayerView } from "./buildPlayerView";
import type { AbilityId, CombatFaction, CombatRole } from "./types";

function addUnit(simulation: CombatSimulation, id: string, faction: CombatFaction, role: CombatRole, abilities: AbilityId[], x: number) {
  simulation.addUnit({ id, name: id, faction, role, groupId: faction, position: { x, z: 0 }, stats: roleStats[role], abilities });
}

describe("CombatSimulation", () => {
  it("regenerates energy while clamping threat to the global range", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party");
    addUnit(simulation, "tank", "party", "tank", ["tank-threat-shout", "tank-taunt"], 0);
    const tank = simulation.units.get("tank")!;
    tank.energy = 0;
    tank.threat = 3;

    simulation.update(1);

    expect(tank.energy).toBeGreaterThan(8);
    expect(tank.threat).toBe(0);
  });

  it("forces a taunted enemy onto the tank for five seconds", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party", "aggressive");
    simulation.addGroup("enemy", "enemy", "aggressive");
    addUnit(simulation, "tank", "party", "tank", ["tank-threat-shout", "tank-taunt"], 0);
    addUnit(simulation, "mage", "party", "ranged", ["ranged-fireball", "ranged-meteor"], 1);
    addUnit(simulation, "enemy", "enemy", "melee", ["melee-fan-of-knives", "melee-backstab"], 4);
    simulation.units.get("mage")!.threat = 80;

    simulation.update(0.15);
    simulation.update(0.15);

    const enemy = simulation.units.get("enemy")!;
    expect(enemy.forcedTargetId).toBe("tank");
    expect(enemy.forcedTargetRemaining).toBeGreaterThan(4.8);
  });

  it("recalls a group into defensive stance and interrupts actions", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party", "aggressive");
    addUnit(simulation, "healer", "party", "healer", ["healer-heal", "healer-healing-circle"], 0);
    const healer = simulation.units.get("healer")!;
    healer.channel = { abilityId: "healer-healing-circle", position: { x: 0, z: 0 }, remaining: 4, tickRemaining: 1 };
    healer.action = "channeling";

    simulation.recallGroup("party");

    expect(simulation.groups.get("party")?.stance).toBe("defensive");
    expect(healer.channel).toBeNull();
    expect(healer.action).toBe("returning");
  });

  it("does not expose opposing combat resources in a player view", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party", "balanced", "player-a");
    simulation.addGroup("enemy", "enemy", "balanced", "player-b");
    addUnit(simulation, "party-unit", "party", "tank", ["tank-threat-shout", "tank-taunt"], 0);
    addUnit(simulation, "enemy-unit", "enemy", "ranged", ["ranged-fireball", "ranged-meteor"], 4);

    const view = buildPlayerView(simulation, "player-a");

    expect(view.ownedUnits.map((unit) => unit.id)).toEqual(["party-unit"]);
    expect(view.publicUnits.find((unit) => unit.id === "enemy-unit")).not.toHaveProperty("energy");
  });

  it("keeps an Awareness-started group engagement until recall", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party");
    simulation.addGroup("enemy", "enemy");
    addUnit(simulation, "party-unit", "party", "tank", ["tank-threat-shout", "tank-taunt"], 0);
    addUnit(simulation, "enemy-unit", "enemy", "melee", ["melee-fan-of-knives", "melee-backstab"], 5);

    simulation.update(1 / 30);
    simulation.setUnitPosition("enemy-unit", { x: 80, z: 0 });
    simulation.update(1 / 30);

    expect(simulation.groups.get("party")?.engagedGroupIds).toContain("enemy");
    expect(simulation.units.get("party-unit")?.targetId).toBe("enemy-unit");

    simulation.recallGroup("party");

    expect(simulation.groups.get("party")?.engagedGroupIds).toEqual([]);
  });

  it("delays Fireball damage until its cast completes", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party", "aggressive");
    simulation.addGroup("enemy", "enemy");
    addUnit(simulation, "mage", "party", "ranged", ["ranged-fireball", "ranged-meteor"], 0);
    addUnit(simulation, "enemy", "enemy", "melee", ["melee-fan-of-knives", "melee-backstab"], 5);
    const enemy = simulation.units.get("enemy")!;
    const before = enemy.health;

    simulation.update(0.1);
    expect(enemy.health).toBe(before);
    simulation.update(0.4);

    expect(enemy.health).toBeLessThan(before);
  });

  it("supports planner-style stat and ability loadout changes", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party");
    addUnit(simulation, "unit", "party", "melee", ["melee-fan-of-knives", "melee-backstab"], 0);
    const before = simulation.units.get("unit")!;
    before.health = before.maxHealth / 2;

    expect(simulation.configureUnit("unit", {
      stats: { stamina: 12, awareness: 15 },
      abilities: ["ranged-fireball", "ranged-fireball", "healer-heal"],
    })).toBe(true);

    const after = simulation.units.get("unit")!;
    expect(after.maxHealth).toBe(220);
    expect(after.health).toBe(110);
    expect(after.abilities).toEqual(["ranged-fireball", "healer-heal"]);
    expect(after.cooldowns["ranged-fireball"]).toBe(0);
  });

  it("evaluates an equipped ability even when it does not match the unit's starter role", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party", "aggressive");
    simulation.addGroup("enemy", "enemy");
    addUnit(simulation, "custom-unit", "party", "melee", ["ranged-fireball"], 0);
    addUnit(simulation, "enemy", "enemy", "tank", ["tank-threat-shout", "tank-taunt"], 5);
    const enemy = simulation.units.get("enemy")!;
    const health = enemy.health;

    simulation.update(0.1);
    simulation.update(0.4);

    expect(enemy.health).toBeLessThan(health);
  });

  it("accepts group commands only from the owner and moves the simulation anchor", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party", "balanced", "player-a");

    expect(simulation.enqueueCommand({ type: "move", groupId: "party", ownerId: "player-b", position: { x: 10, z: 0 } })).toBe(false);
    expect(simulation.enqueueCommand({ type: "move", groupId: "party", ownerId: "player-a", position: { x: 10, z: 0 } })).toBe(true);
    simulation.update(1);

    expect(simulation.groups.get("party")?.anchor.x).toBe(10);
  });

  it("uses stance policy energy reserves for high-cost abilities", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party", "balanced");
    simulation.addGroup("enemy", "enemy");
    addUnit(simulation, "caster", "party", "melee", ["ranged-meteor"], 0);
    addUnit(simulation, "enemy-1", "enemy", "tank", ["tank-threat-shout", "tank-taunt"], 5);
    addUnit(simulation, "enemy-2", "enemy", "tank", ["tank-threat-shout", "tank-taunt"], 6);
    addUnit(simulation, "enemy-3", "enemy", "tank", ["tank-threat-shout", "tank-taunt"], 7);
    simulation.units.get("caster")!.energy = 80;

    simulation.update(0.1);
    expect(simulation.consumeEvents().some((event) => event.type === "cast" && event.abilityId === "ranged-meteor")).toBe(false);

    simulation.setGroupStance("party", "aggressive");
    simulation.update(0.1);
    expect(simulation.consumeEvents().some((event) => event.type === "cast" && event.abilityId === "ranged-meteor")).toBe(true);
  });
});
