import { ENERGY_MAX, THREAT_DECAY_PER_SECOND, THREAT_MAX, attackInterval, awarenessRange, energyRegen, maxHealth } from "./combatBalance";
import type { AbilityId, CombatCommand, CombatEvent, CombatFaction, CombatGroup, CombatRole, CombatStance, CombatUnit, UnitStats, Vec2 } from "./types";
import { abilityCatalog } from "./abilityCatalog";
import { stancePolicies } from "./stancePolicies";

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clone = (position: Vec2): Vec2 => ({ x: position.x, z: position.z });


export class CombatSimulation {
  readonly units = new Map<string, CombatUnit>();
  readonly groups = new Map<string, CombatGroup>();
  private readonly eventsInternal: CombatEvent[] = [];
  private readonly commands: CombatCommand[] = [];
  private tick = 0;

  addGroup(id: string, faction: CombatFaction, stance: CombatStance = "balanced", ownerId: string = faction) {
    this.groups.set(id, { id, ownerId, faction, stance, recalled: false, engagedGroupIds: [], anchor: { x: 0, z: 0 }, moveTarget: null });
  }

  addUnit(config: { id: string; name: string; faction: CombatFaction; role: CombatRole; groupId: string; position: Vec2; stats: UnitStats; abilities: AbilityId[] }) {
    const health = maxHealth(config.stats);
    const cooldowns = Object.fromEntries(config.abilities.map((ability) => [ability, 0])) as Record<AbilityId, number>;
    this.units.set(config.id, {
      ...config, ownerId: this.groups.get(config.groupId)?.ownerId ?? config.faction, position: clone(config.position), home: clone(config.position), health, maxHealth: health, energy: ENERGY_MAX,
      maxEnergy: ENERGY_MAX, threat: 0, alive: true, targetId: null, forcedTargetId: null, forcedTargetRemaining: 0,
      action: "idle", attackRemaining: 0, cooldowns, cast: null, channel: null,
    });
  }

  setGroupStance(groupId: string, stance: CombatStance) {
    const group = this.groups.get(groupId);
    if (group) { group.stance = stance; group.recalled = false; }
  }

  setGroupAnchor(groupId: string, anchor: Vec2) {
    const group = this.groups.get(groupId);
    if (group) group.anchor = clone(anchor);
  }

  enqueueCommand(command: CombatCommand) {
    const group = this.groups.get(command.groupId);
    if (!group || group.ownerId !== command.ownerId) return false;
    if (command.type === "move" && (!Number.isFinite(command.position.x) || !Number.isFinite(command.position.z))) return false;
    this.commands.push(command);
    return true;
  }

  recallGroup(groupId: string) {
    const group = this.groups.get(groupId);
    if (!group) return;
    group.stance = "defensive";
    group.recalled = true;
    group.moveTarget = null;
    group.engagedGroupIds.forEach((enemyGroupId) => {
      const enemyGroup = this.groups.get(enemyGroupId);
      if (enemyGroup) enemyGroup.engagedGroupIds = enemyGroup.engagedGroupIds.filter((id) => id !== groupId);
    });
    group.engagedGroupIds = [];
    for (const unit of this.units.values()) if (unit.groupId === groupId && unit.alive) {
      unit.targetId = null; unit.forcedTargetId = null; unit.forcedTargetRemaining = 0; unit.cast = null; unit.channel = null; unit.action = "returning";
    }
  }

  setUnitPosition(id: string, position: Vec2) {
    const unit = this.units.get(id);
    if (unit) unit.position = clone(position);
  }

  setUnitHome(id: string, position: Vec2) {
    const unit = this.units.get(id);
    if (unit) unit.home = clone(position);
  }

  setUnitGroup(id: string, groupId: string) {
    const unit = this.units.get(id);
    if (unit) unit.groupId = groupId;
  }

  removeGroup(groupId: string) {
    const group = this.groups.get(groupId);
    if (!group) return;
    group.engagedGroupIds.forEach((otherId) => {
      const other = this.groups.get(otherId);
      if (other) other.engagedGroupIds = other.engagedGroupIds.filter((id) => id !== groupId);
    });
    this.groups.delete(groupId);
  }

  /** Future party-planner entry point: validate abilities and recalculate resources without recreating the unit. */
  configureUnit(id: string, config: { stats?: Partial<UnitStats>; abilities?: AbilityId[] }) {
    const unit = this.units.get(id);
    if (!unit) return false;
    if (config.stats) {
      const healthFraction = unit.maxHealth === 0 ? 0 : unit.health / unit.maxHealth;
      const energyFraction = unit.maxEnergy === 0 ? 0 : unit.energy / unit.maxEnergy;
      unit.stats = { ...unit.stats, ...config.stats };
      unit.maxHealth = maxHealth(unit.stats);
      unit.maxEnergy = ENERGY_MAX;
      unit.health = clamp(unit.maxHealth * healthFraction, 0, unit.maxHealth);
      unit.energy = clamp(unit.maxEnergy * energyFraction, 0, unit.maxEnergy);
    }
    if (config.abilities) {
      const abilities = [...new Set(config.abilities)].filter((ability) => abilityCatalog[ability]);
      unit.abilities = abilities;
      unit.cooldowns = Object.fromEntries(abilities.map((ability) => [ability, unit.cooldowns[ability] ?? 0])) as Record<AbilityId, number>;
    }
    return true;
  }

  consumeEvents() { return this.eventsInternal.splice(0); }

  update(dt: number) {
    this.tick += 1;
    this.processCommands();
    this.updateComputerStances();
    this.advanceGroupMovement(dt);
    for (const unit of this.units.values()) this.advanceResources(unit, dt);
    for (const unit of this.units.values()) this.advanceAction(unit, dt);
    for (const unit of this.units.values()) this.decide(unit, dt);
  }

  private advanceResources(unit: CombatUnit, dt: number) {
    if (!unit.alive) return;
    unit.energy = clamp(unit.energy + energyRegen(unit.stats) * dt, 0, unit.maxEnergy);
    unit.threat = clamp(unit.threat - THREAT_DECAY_PER_SECOND * dt, 0, THREAT_MAX);
    unit.attackRemaining = Math.max(0, unit.attackRemaining - dt);
    (Object.keys(unit.cooldowns) as AbilityId[]).forEach((id) => unit.cooldowns[id] = Math.max(0, unit.cooldowns[id] - dt));
    if (unit.forcedTargetRemaining > 0) {
      unit.forcedTargetRemaining = Math.max(0, unit.forcedTargetRemaining - dt);
      if (unit.forcedTargetRemaining === 0) unit.forcedTargetId = null;
    }
  }

  private processCommands() {
    for (const command of this.commands.splice(0)) {
      const group = this.groups.get(command.groupId);
      if (!group || group.ownerId !== command.ownerId) continue;
      if (command.type === "move") { group.moveTarget = clone(command.position); group.recalled = false; }
      if (command.type === "set-stance") this.setGroupStance(command.groupId, command.stance);
      if (command.type === "recall") this.recallGroup(command.groupId);
    }
  }

  private advanceGroupMovement(dt: number) {
    for (const group of this.groups.values()) {
      if (!group.moveTarget) continue;
      const dx = group.moveTarget.x - group.anchor.x;
      const dz = group.moveTarget.z - group.anchor.z;
      const length = Math.hypot(dx, dz);
      if (length <= 0.02) { group.anchor = clone(group.moveTarget); group.moveTarget = null; continue; }
      const amount = Math.min(length, 10.5 * dt);
      group.anchor = { x: group.anchor.x + dx / length * amount, z: group.anchor.z + dz / length * amount };
    }
  }

  private advanceAction(unit: CombatUnit, dt: number) {
    if (!unit.alive) return;
    if (unit.cast) {
      unit.cast.remaining -= dt;
      if (unit.cast.remaining <= 0) {
        const cast = unit.cast;
        unit.cast = null;
        this.resolveCast(unit, cast.abilityId, cast.targetId, cast.position);
      }
      return;
    }
    if (unit.channel) {
      unit.channel.remaining -= dt;
      unit.channel.tickRemaining -= dt;
      if (unit.channel.tickRemaining <= 0) {
        unit.channel.tickRemaining += 1;
        this.healArea(unit, unit.channel.position, 4, 12 + unit.stats.wisdom * 1.5);
      }
      if (unit.channel.remaining <= 0) { unit.channel = null; unit.action = "idle"; }
      return;
    }
    const group = this.groups.get(unit.groupId);
    if (group?.recalled && unit.action === "returning") {
      this.move(unit, unit.home, 8, dt);
      if (distance(unit.position, unit.home) < 0.1) unit.action = "idle";
    }
  }

  private decide(unit: CombatUnit, dt: number) {
    if (!unit.alive || unit.cast || unit.channel || unit.action === "returning") return;
    const group = this.groups.get(unit.groupId);
    if (!group) return;
    const target = this.selectTarget(unit);
    unit.targetId = target?.id ?? null;
    if (!target) { unit.action = "idle"; return; }

    const ability = this.chooseAbility(unit, target, group.stance);
    if (ability) { this.cast(unit, ability.id, ability.target); return; }
    const range = unit.role === "tank" || unit.role === "melee" ? 1.8 : 9;
    if (distance(unit.position, target.position) > range) {
      const policy = stancePolicies[group.stance];
      if (policy.allowUnlimitedPursuit || distance(unit.position, unit.home) < policy.formationTether) { unit.action = "pursuing"; this.move(unit, target.position, 7.4, dt); }
      return;
    }
    if (unit.attackRemaining === 0) this.autoAttack(unit, target);
  }

  private selectTarget(unit: CombatUnit) {
    const hostile = [...this.units.values()].filter((candidate) => candidate.alive && candidate.faction !== unit.faction);
    if (hostile.length === 0) return undefined;
    const forced = unit.forcedTargetId ? this.units.get(unit.forcedTargetId) : undefined;
    if (forced?.alive && forced.faction !== unit.faction) return forced;
    const group = this.groups.get(unit.groupId);
    const detected = hostile.filter((candidate) => distance(unit.position, candidate.position) <= awarenessRange(unit.stats));
    detected.forEach((candidate) => this.engageGroups(unit.groupId, candidate.groupId));
    const candidates = hostile.filter((candidate) => group?.engagedGroupIds.includes(candidate.groupId));
    if (candidates.length === 0) return undefined;
    const highest = Math.max(...candidates.map((candidate) => candidate.threat));
    const current = candidates.find((candidate) => candidate.id === unit.targetId);
    if (current && current.threat === highest) return current;
    return candidates.filter((candidate) => candidate.threat === highest).sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  private chooseAbility(unit: CombatUnit, target: CombatUnit, stance: CombatStance) {
    const candidates = unit.abilities
      .filter((id) => unit.energy >= abilityCatalog[id].energyCost && unit.cooldowns[id] === 0)
      .map((id) => this.evaluateAbility(unit, id, target, stance))
      .filter((candidate): candidate is { id: AbilityId; target: CombatUnit; score: number } => candidate !== undefined);
    return candidates.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0];
  }

  /** Ability evaluation is keyed by equipped ability, never by the caster's role. */
  private evaluateAbility(unit: CombatUnit, id: AbilityId, hostileTarget: CombatUnit, stance: CombatStance) {
    const friendlies = [...this.units.values()].filter((candidate) => candidate.alive && candidate.faction === unit.faction);
    const injured = friendlies.filter((candidate) => candidate.health / candidate.maxHealth < 0.82);
    const lowestAlly = this.lowestHealthAlly(unit);
    const nearbyEnemies = [...this.units.values()].filter((candidate) => candidate.alive && candidate.faction !== unit.faction && distance(candidate.position, unit.position) <= 4);
    const cluster = [...this.units.values()].filter((candidate) => candidate.alive && candidate.faction !== unit.faction && distance(candidate.position, hostileTarget.position) <= 4);
    const highestFriendlyThreat = Math.max(...friendlies.map((candidate) => candidate.threat));
    const criticalAllies = injured.filter((candidate) => candidate.health / candidate.maxHealth < 0.4).length;

    const policy = stancePolicies[stance];
    const highAllowed = (emergency: boolean) => !abilityCatalog[id].highCost || unit.energy - abilityCatalog[id].energyCost >= policy.energyReserve || (emergency && policy.emergencyOverridesReserve);
    if (id === "tank-threat-shout" && unit.threat + 15 < highestFriendlyThreat) return { id, target: hostileTarget, score: 76 };
    if (id === "tank-taunt" && hostileTarget.targetId !== unit.id && highestFriendlyThreat > unit.threat && highAllowed(true)) return { id, target: hostileTarget, score: 100 };
    if (id === "melee-fan-of-knives" && nearbyEnemies.length >= 2) return { id, target: hostileTarget, score: 48 + nearbyEnemies.length };
    if (id === "melee-backstab" && distance(unit.position, hostileTarget.position) <= 8 && highAllowed(false)) return { id, target: hostileTarget, score: 62 };
    if (id === "ranged-fireball" && distance(unit.position, hostileTarget.position) <= 10) return { id, target: hostileTarget, score: 36 };
    if (id === "ranged-meteor" && cluster.length >= 3 && highAllowed(false)) return { id, target: hostileTarget, score: 72 + cluster.length };
    if (id === "healer-heal" && lowestAlly && lowestAlly.health / lowestAlly.maxHealth < 0.82) return { id, target: lowestAlly, score: lowestAlly.health / lowestAlly.maxHealth < 0.4 ? 95 : 52 };
    if (id === "healer-healing-circle" && lowestAlly && (injured.length >= 3 || criticalAllies >= 2) && highAllowed(criticalAllies >= 2)) return { id, target: lowestAlly, score: 86 + criticalAllies };
    return undefined;
  }

  private cast(unit: CombatUnit, ability: AbilityId, target: CombatUnit) {
    unit.energy -= abilityCatalog[ability].energyCost; unit.cooldowns[ability] = abilityCatalog[ability].cooldownSeconds; unit.action = "casting";
    const friendlyTarget = ability === "healer-heal" || ability === "healer-healing-circle" ? this.lowestHealthAlly(unit) : target;
    const targetPosition = clone(friendlyTarget?.position ?? target.position);
    this.eventsInternal.push({ type: "cast", sourceId: unit.id, abilityId: ability, targetId: friendlyTarget?.id ?? target.id, position: targetPosition });
    unit.cast = { abilityId: ability, targetId: friendlyTarget?.id ?? target.id, position: targetPosition, remaining: this.castTime(ability) };
  }

  private resolveCast(unit: CombatUnit, ability: AbilityId, targetId: string | null, position: Vec2) {
    const target = targetId ? this.units.get(targetId) : undefined;
    if (ability === "tank-threat-shout") { this.addThreat(unit, 35); unit.action = "idle"; return; }
    if (ability === "tank-taunt") {
      if (!target?.alive || target.faction === unit.faction) { unit.action = "idle"; return; }
      target.forcedTargetId = unit.id; target.forcedTargetRemaining = 5; target.targetId = unit.id; target.cast = null; target.channel = null; target.action = "idle";
      const highest = Math.max(...[...this.units.values()].filter((candidate) => candidate.alive && candidate.faction === unit.faction).map((candidate) => candidate.threat));
      unit.threat = clamp(Math.max(unit.threat, highest + 1), 0, THREAT_MAX);
      this.eventsInternal.push({ type: "taunt", sourceId: unit.id, targetId: target.id }); unit.action = "idle"; return;
    }
    if (ability === "melee-fan-of-knives") { this.damageArea(unit, unit.position, 3, 18 + unit.stats.strength); unit.action = "idle"; return; }
    if (ability === "melee-backstab") {
      if (!target?.alive || target.faction === unit.faction) { unit.action = "idle"; return; }
      const dx = target.position.x - unit.position.x; const dz = target.position.z - unit.position.z; const length = Math.max(0.01, Math.hypot(dx, dz));
      unit.position = { x: target.position.x + dx / length, z: target.position.z + dz / length };
      this.damage(unit, target, 42 + unit.stats.strength * 1.5 + unit.stats.agility * .5); unit.action = "idle"; return;
    }
    if (ability === "ranged-fireball") { if (target?.alive && target.faction !== unit.faction) this.damage(unit, target, 24 + unit.stats.intelligence * 1.5); unit.action = "idle"; return; }
    if (ability === "ranged-meteor") { this.damageArea(unit, position, 4, 50 + unit.stats.intelligence * 2); unit.action = "idle"; return; }
    if (ability === "healer-heal") { if (target?.alive && target.faction === unit.faction) this.heal(unit, target, 26 + unit.stats.wisdom * 1.7); unit.action = "idle"; return; }
    if (ability === "healer-healing-circle") { unit.channel = { abilityId: ability, position: clone(position), remaining: 5, tickRemaining: 0 }; unit.action = "channeling"; }
  }

  private castTime(ability: AbilityId) {
    if (ability === "ranged-fireball") return 0.35;
    if (ability === "ranged-meteor") return 0.8;
    return 0.1;
  }

  private autoAttack(unit: CombatUnit, target: CombatUnit) {
    const isMelee = unit.role === "tank" || unit.role === "melee";
    const damage = isMelee ? 8 + unit.stats.strength : 7 + unit.stats.intelligence;
    this.damage(unit, target, damage);
    unit.attackRemaining = attackInterval(unit.stats, isMelee ? 1.5 : 1.8); unit.action = "attacking";
  }

  private damageArea(source: CombatUnit, position: Vec2, radius: number, amount: number) {
    for (const target of this.units.values()) if (target.alive && target.faction !== source.faction && distance(target.position, position) <= radius) this.damage(source, target, amount);
  }
  private healArea(source: CombatUnit, position: Vec2, radius: number, amount: number) {
    for (const target of this.units.values()) if (target.alive && target.faction === source.faction && distance(target.position, position) <= radius) this.heal(source, target, amount);
  }
  private damage(source: CombatUnit, target: CombatUnit, amount: number) {
    this.engageGroups(source.groupId, target.groupId);
    const applied = Math.min(amount, target.health); target.health -= applied; this.addThreat(source, applied); this.eventsInternal.push({ type: "damage", sourceId: source.id, targetId: target.id, amount: applied });
    if (target.health <= 0) { target.alive = false; target.action = "dead"; target.targetId = null; target.cast = null; target.channel = null; this.eventsInternal.push({ type: "death", unitId: target.id }); }
  }
  private heal(source: CombatUnit, target: CombatUnit, amount: number) {
    const applied = Math.min(amount, target.maxHealth - target.health); if (applied <= 0) return; target.health += applied; this.addThreat(source, applied); this.eventsInternal.push({ type: "heal", sourceId: source.id, targetId: target.id, amount: applied });
  }
  private addThreat(unit: CombatUnit, amount: number) { unit.threat = clamp(unit.threat + amount, 0, THREAT_MAX); }
  private engageGroups(leftId: string, rightId: string) {
    if (leftId === rightId) return;
    const left = this.groups.get(leftId); const right = this.groups.get(rightId);
    if (!left || !right || left.faction === right.faction) return;
    if (!left.engagedGroupIds.includes(rightId)) left.engagedGroupIds.push(rightId);
    if (!right.engagedGroupIds.includes(leftId)) right.engagedGroupIds.push(leftId);
  }
  private updateComputerStances() {
    for (const group of this.groups.values()) {
      if (group.faction !== "enemy" || group.recalled) continue;
      const members = [...this.units.values()].filter((unit) => unit.groupId === group.id && unit.alive);
      if (members.length === 0) continue;
      const healthFraction = members.reduce((total, unit) => total + unit.health / unit.maxHealth, 0) / members.length;
      group.stance = healthFraction < 0.35 ? "defensive" : healthFraction > 0.72 ? "aggressive" : "balanced";
    }
  }
  private lowestHealthAlly(unit: CombatUnit) { return [...this.units.values()].filter((candidate) => candidate.alive && candidate.faction === unit.faction).sort((a, b) => a.health / a.maxHealth - b.health / b.maxHealth || a.id.localeCompare(b.id))[0]; }
  private move(unit: CombatUnit, target: Vec2, speed: number, dt: number) { const dx = target.x - unit.position.x; const dz = target.z - unit.position.z; const length = Math.hypot(dx, dz); if (length > 0.001) { const amount = Math.min(length, speed * dt); unit.position = { x: unit.position.x + dx / length * amount, z: unit.position.z + dz / length * amount }; } }
}
