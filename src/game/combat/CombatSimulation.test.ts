import { describe, expect, it } from "vitest";
import { CombatSimulation } from "./CombatSimulation";
import { buildPlayerView } from "./buildPlayerView";
import { roleStats } from "./combatBalance";
import type { AbilityId, CombatFaction, CombatRole } from "./types";

function addUnit(
  simulation: CombatSimulation,
  id: string,
  faction: CombatFaction,
  role: CombatRole,
  abilities: AbilityId[],
  x: number,
  z = 0,
  groupId = faction,
) {
  simulation.addUnit({ id, name: id, faction, role, groupId, position: { x, z }, stats: roleStats[role], abilities });
  return simulation.units.get(id)!;
}

function addSides(simulation: CombatSimulation, partyStance: "aggressive" | "balanced" | "defensive" = "balanced") {
  simulation.addGroup("party", "party", partyStance, "player-a");
  simulation.addGroup("enemy", "enemy", "balanced", "player-b");
}

function step(simulation: CombatSimulation, seconds: number, dt = 0.05) {
  for (let elapsed = 0; elapsed < seconds - 0.0001; elapsed += dt) simulation.update(Math.min(dt, seconds - elapsed));
}

describe("resources, ownership, and configuration", () => {
  it("regenerates energy and continuously clamps decaying threat", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party");
    const tank = addUnit(simulation, "tank", "party", "tank", [], 0);
    tank.energy = 0;
    tank.threat = 3;
    simulation.update(1);
    expect(tank.energy).toBeGreaterThan(3.5);
    expect(tank.threat).toBe(0);
  });

  it("validates command ownership and resumes a recalled unit on a new command", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party", "balanced", "player-a");
    const unit = addUnit(simulation, "unit", "party", "tank", [], 0);
    simulation.recallGroup("party");
    expect(unit.action).toBe("returning");
    expect(simulation.enqueueCommand({ type: "move", groupId: "party", ownerId: "player-b", position: { x: 10, z: 0 } })).toBe(false);
    expect(simulation.enqueueCommand({ type: "move", groupId: "party", ownerId: "player-a", position: { x: 10, z: 0 } })).toBe(true);
    simulation.update(1);
    expect(simulation.groups.get("party")?.recalled).toBe(false);
    expect(unit.action).not.toBe("returning");
    expect(simulation.groups.get("party")?.anchor.x).toBe(10);
  });

  it("supports planner loadouts independent of role and sanitizes stats", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party");
    const unit = addUnit(simulation, "unit", "party", "melee", ["melee-fan-of-knives"], 0);
    unit.health = unit.maxHealth / 2;
    expect(simulation.configureUnit("unit", { stats: { stamina: 12, awareness: 99 }, abilities: ["ranged-fireball", "ranged-fireball", "healer-heal"] })).toBe(true);
    expect(unit.maxHealth).toBe(412);
    expect(unit.health).toBe(206);
    expect(unit.stats.awareness).toBe(30);
    expect(unit.abilities).toEqual(["ranged-fireball", "healer-heal"]);
  });

  it("keeps opposing resources private", () => {
    const simulation = new CombatSimulation();
    addSides(simulation);
    addUnit(simulation, "owned", "party", "tank", [], 0);
    addUnit(simulation, "hostile", "enemy", "ranged", [], 4);
    const view = buildPlayerView(simulation, "player-a");
    expect(view.ownedUnits.map((unit) => unit.id)).toEqual(["owned"]);
    expect(view.publicUnits.find((unit) => unit.id === "hostile")).not.toHaveProperty("energy");
  });
});

describe("global threat, awareness, and recall", () => {
  it("selects globally by threat among perceived hostiles without pulling later encounters", () => {
    const simulation = new CombatSimulation();
    addSides(simulation);
    const attacker = addUnit(simulation, "attacker", "party", "tank", [], 0);
    const nearby = addUnit(simulation, "nearby", "enemy", "tank", [], 5);
    const distant = addUnit(simulation, "distant", "enemy", "ranged", [], 60);
    nearby.threat = 10;
    distant.threat = 80;
    simulation.update(0.01);
    expect(simulation.groups.get("party")?.engagedFactionIds).toContain("enemy");
    expect(attacker.targetId).toBe("nearby");
    expect(attacker.action).toBe("pursuing");
    nearby.alive = false;
    simulation.update(0.01);
    expect(attacker.targetId).toBeNull();
  });

  it("retains its current target when threat is tied and switches only when another is higher", () => {
    const simulation = new CombatSimulation();
    addSides(simulation);
    const attacker = addUnit(simulation, "attacker", "party", "tank", [], 0);
    const first = addUnit(simulation, "a", "enemy", "tank", [], 5);
    const second = addUnit(simulation, "b", "enemy", "tank", [], 6);
    first.threat = 20;
    second.threat = 20;
    attacker.targetId = "b";
    simulation.update(0.01);
    expect(attacker.targetId).toBe("b");
    first.threat = 21;
    simulation.update(0.01);
    expect(attacker.targetId).toBe("a");
  });

  it("makes recall directional rather than clearing the opponent's pursuit", () => {
    const simulation = new CombatSimulation();
    addSides(simulation);
    addUnit(simulation, "party-unit", "party", "tank", [], 0);
    addUnit(simulation, "enemy-unit", "enemy", "tank", [], 5);
    simulation.update(0.01);
    expect(simulation.groups.get("party")?.engagedFactionIds).toContain("enemy");
    expect(simulation.groups.get("enemy")?.engagedFactionIds).toContain("party");
    simulation.recallGroup("party");
    expect(simulation.groups.get("party")?.engagedFactionIds).toEqual([]);
    expect(simulation.groups.get("enemy")?.engagedFactionIds).toContain("party");
  });

  it("applies computer stance logic by controller rather than faction", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("human-enemy", "enemy", "aggressive", "player-b", "human");
    simulation.addGroup("computer-party", "party", "balanced", "cpu", "computer");
    const human = addUnit(simulation, "human", "enemy", "tank", [], 0, 0, "human-enemy");
    const computer = addUnit(simulation, "computer", "party", "tank", [], 50, 0, "computer-party");
    human.health = human.maxHealth * 0.1;
    computer.health = computer.maxHealth * 0.1;
    simulation.update(0.01);
    expect(simulation.groups.get("human-enemy")?.stance).toBe("aggressive");
    expect(simulation.groups.get("computer-party")?.stance).toBe("defensive");
  });
});

describe("taunt and auto-attacks", () => {
  it("interrupts a cast and forces only auto-attacks against the tank for five seconds", () => {
    const simulation = new CombatSimulation();
    addSides(simulation, "aggressive");
    const tank = addUnit(simulation, "tank", "party", "tank", ["tank-taunt"], 0);
    const mage = addUnit(simulation, "mage", "party", "ranged", [], 0.5);
    const enemy = addUnit(simulation, "enemy", "enemy", "ranged", ["ranged-fireball"], 5);
    mage.threat = 80;
    simulation.update(0.05);
    expect(enemy.cast?.abilityId).toBe("ranged-fireball");
    simulation.consumeEvents();
    simulation.update(0.1);
    simulation.update(0.11);
    expect(enemy.cast).toBeNull();
    expect(enemy.forcedTargetId).toBe(tank.id);
    expect(enemy.forcedTargetRemaining).toBeCloseTo(5, 1);
    step(simulation, 1);
    const events = simulation.consumeEvents();
    expect(events.some((event) => event.type === "cast-started" && event.sourceId === enemy.id)).toBe(false);
    expect(events.some((event) => event.type === "auto-attack" && event.sourceId === enemy.id && event.targetId === tank.id)).toBe(true);
    expect(enemy.targetId).toBe(tank.id);
    step(simulation, 4.1);
    expect(enemy.forcedTargetRemaining).toBe(0);
  });

  it("uses sword attacks for tanks/melee and wand projectiles for ranged/healers", () => {
    const simulation = new CombatSimulation();
    addSides(simulation);
    addUnit(simulation, "sword", "party", "melee", [], 0);
    addUnit(simulation, "wand", "party", "healer", [], 0, 2);
    addUnit(simulation, "enemy", "enemy", "tank", [], 1);
    simulation.update(0.01);
    const events = simulation.consumeEvents();
    expect(events.some((event) => event.type === "auto-attack" && event.sourceId === "sword" && event.kind === "sword")).toBe(true);
    expect(events.some((event) => event.type === "projectile-launched" && event.sourceId === "wand" && event.kind === "wand")).toBe(true);
  });
});

describe("the eight starter abilities", () => {
  it("Threat Shout raises the tank's capped global threat", () => {
    const simulation = new CombatSimulation();
    addSides(simulation);
    const tank = addUnit(simulation, "tank", "party", "tank", ["tank-threat-shout"], 0);
    addUnit(simulation, "enemy", "enemy", "tank", [], 5);
    simulation.update(0.05);
    expect(tank.energy).toBeLessThan(100);
    expect(tank.threat).toBeGreaterThan(30);
    step(simulation, 0.5);
    expect(simulation.consumeEvents().some((event) => event.type === "ability-impact" && event.abilityId === "tank-threat-shout")).toBe(true);
  });

  it("Fan of Knives damages every surrounding hostile once", () => {
    const simulation = new CombatSimulation();
    addSides(simulation, "aggressive");
    addUnit(simulation, "rogue", "party", "melee", ["melee-fan-of-knives"], 0);
    const one = addUnit(simulation, "one", "enemy", "tank", [], 2);
    const two = addUnit(simulation, "two", "enemy", "tank", [], -2);
    const far = addUnit(simulation, "far", "enemy", "tank", [], 6);
    const before = [one.health, two.health, far.health];
    step(simulation, 0.5);
    expect(one.health).toBeLessThan(before[0]);
    expect(two.health).toBeLessThan(before[1]);
    expect(far.health).toBe(before[2]);
  });

  it("Backstab teleports through the target and deals a high hit", () => {
    const simulation = new CombatSimulation();
    addSides(simulation, "aggressive");
    const rogue = addUnit(simulation, "rogue", "party", "melee", ["melee-backstab"], 0);
    const target = addUnit(simulation, "target", "enemy", "tank", [], 5);
    const health = target.health;
    step(simulation, 0.5);
    expect(rogue.position.x).toBeGreaterThan(target.position.x);
    expect(target.health).toBeLessThan(health - 25);
    expect(simulation.consumeEvents().some((event) => event.type === "teleport")).toBe(true);
  });

  it("Fireball applies damage after cast and projectile travel", () => {
    const simulation = new CombatSimulation();
    addSides(simulation, "aggressive");
    addUnit(simulation, "mage", "party", "ranged", ["ranged-fireball"], 0);
    const target = addUnit(simulation, "target", "enemy", "tank", [], 5);
    const health = target.health;
    step(simulation, 0.6);
    expect(target.health).toBe(health);
    step(simulation, 0.2);
    expect(simulation.consumeEvents().some((event) => event.type === "projectile-launched" && event.kind === "fireball")).toBe(true);
    step(simulation, 0.4);
    expect(target.health).toBeLessThan(health);
  });

  it("Meteor telegraphs, travels, and damages a hostile cluster on impact", () => {
    const simulation = new CombatSimulation();
    addSides(simulation, "aggressive");
    addUnit(simulation, "mage", "party", "ranged", ["ranged-meteor"], 0);
    const targets = [
      addUnit(simulation, "one", "enemy", "tank", [], 6, 0),
      addUnit(simulation, "two", "enemy", "tank", [], 6, 1),
      addUnit(simulation, "three", "enemy", "tank", [], 6, -1),
    ];
    simulation.recallGroup("enemy");
    const health = targets[0].health;
    step(simulation, 1.25);
    expect(targets[0].health).toBe(health);
    step(simulation, 0.2);
    expect(simulation.consumeEvents().some((event) => event.type === "projectile-launched" && event.kind === "meteor")).toBe(true);
    step(simulation, 0.7);
    targets.forEach((target) => expect(target.health).toBeLessThan(health));
  });

  it("Heal works without any hostile target and selects lowest health percentage", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party");
    const healer = addUnit(simulation, "healer", "party", "healer", ["healer-heal"], 0);
    const sturdy = addUnit(simulation, "sturdy", "party", "tank", [], 2);
    const fragile = addUnit(simulation, "fragile", "party", "ranged", [], 3);
    sturdy.health = sturdy.maxHealth * 0.5;
    fragile.health = fragile.maxHealth * 0.25;
    const sturdyHealth = sturdy.health;
    step(simulation, 0.95);
    expect(fragile.health).toBeGreaterThan(fragile.maxHealth * 0.25);
    expect(sturdy.health).toBe(sturdyHealth);
    expect(healer.threat).toBeGreaterThan(0);
  });

  it("Healing Circle channels at a fixed position and heals nearby allies over time", () => {
    const simulation = new CombatSimulation();
    simulation.addGroup("party", "party", "aggressive");
    const healer = addUnit(simulation, "healer", "party", "healer", ["healer-healing-circle"], 0);
    const allies = [
      addUnit(simulation, "one", "party", "tank", [], 1),
      addUnit(simulation, "two", "party", "melee", [], 2),
      addUnit(simulation, "three", "party", "ranged", [], 3),
    ];
    allies.forEach((ally) => ally.health = ally.maxHealth * 0.5);
    step(simulation, 0.45);
    expect(healer.channel?.abilityId).toBe("healer-healing-circle");
    const before = allies.map((ally) => ally.health);
    step(simulation, 0.1);
    allies.forEach((ally, index) => expect(ally.health).toBeGreaterThan(before[index]));
    const start = simulation.consumeEvents().find((event) => event.type === "channel-started");
    expect(start).toBeDefined();
    step(simulation, 5.1);
    expect(healer.channel).toBeNull();
  });
});

describe("stance spending", () => {
  it("reserves high-cost energy in balanced stance and spends it in aggressive stance", () => {
    const simulation = new CombatSimulation();
    addSides(simulation, "balanced");
    const caster = addUnit(simulation, "caster", "party", "melee", ["ranged-meteor"], 0);
    addUnit(simulation, "one", "enemy", "tank", [], 5);
    addUnit(simulation, "two", "enemy", "tank", [], 6);
    addUnit(simulation, "three", "enemy", "tank", [], 7);
    caster.energy = 80;
    simulation.update(0.05);
    expect(simulation.consumeEvents().some((event) => event.type === "cast-started" && event.abilityId === "ranged-meteor")).toBe(false);
    simulation.setGroupStance("party", "aggressive");
    simulation.update(0.05);
    expect(simulation.consumeEvents().some((event) => event.type === "cast-started" && event.abilityId === "ranged-meteor")).toBe(true);
  });
});
