import {
  DAMAGE_THREAT_MULTIPLIER,
  ENERGY_MAX,
  HEALING_THREAT_MULTIPLIER,
  MELEE_AUTO_ATTACK_RANGE,
  MOVEMENT_SPEED,
  RANGED_AUTO_ATTACK_RANGE,
  TAUNT_DURATION_SECONDS,
  THREAT_DECAY_PER_SECOND,
  THREAT_MAX,
  attackInterval,
  awarenessRange,
  energyRegen,
  maxHealth,
  sanitizeStats,
} from "./combatBalance";
import { abilityCatalog } from "./abilityCatalog";
import { stancePolicies } from "./stancePolicies";
import type {
  AbilityId,
  AutoAttackKind,
  CombatCommand,
  CombatController,
  CombatEvent,
  CombatFaction,
  CombatGroup,
  CombatRole,
  CombatStance,
  CombatUnit,
  UnitStats,
  Vec2,
} from "./types";

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clone = (position: Vec2): Vec2 => ({ x: position.x, z: position.z });

type AbilityChoice = { id: AbilityId; targetId: string | null; position: Vec2; score: number; emergency: boolean };
type UntickedCombatEvent = CombatEvent extends infer Event ? Event extends { tick: number } ? Omit<Event, "tick"> : never : never;
type PendingImpact = {
  remaining: number;
  sourceId: string;
  targetId: string | null;
  position: Vec2;
  amount: number;
  radius: number;
  abilityId: AbilityId | null;
  kind: "single-damage" | "area-damage";
};

export class CombatSimulation {
  readonly units = new Map<string, CombatUnit>();
  readonly groups = new Map<string, CombatGroup>();
  private readonly eventsInternal: CombatEvent[] = [];
  private readonly commands: CombatCommand[] = [];
  private readonly pendingImpacts: PendingImpact[] = [];
  private tick = 0;

  addGroup(
    id: string,
    faction: CombatFaction,
    stance: CombatStance = "balanced",
    ownerId: string = faction,
    controller: CombatController = "human",
  ) {
    this.groups.set(id, {
      id,
      ownerId,
      faction,
      controller,
      stance,
      recalled: false,
      engagedFactionIds: [],
      anchor: { x: 0, z: 0 },
      moveTarget: null,
    });
  }

  addUnit(config: { id: string; name: string; faction: CombatFaction; role: CombatRole; groupId: string; position: Vec2; stats: UnitStats; abilities: AbilityId[] }) {
    const stats = sanitizeStats(config.stats);
    const health = maxHealth(stats);
    const abilities = this.validAbilities(config.abilities);
    const cooldowns = Object.fromEntries(abilities.map((ability) => [ability, 0]));
    this.units.set(config.id, {
      ...config,
      stats,
      abilities,
      cooldowns,
      ownerId: this.groups.get(config.groupId)?.ownerId ?? config.faction,
      position: clone(config.position),
      home: clone(config.position),
      facing: { x: 0, z: 1 },
      health,
      maxHealth: health,
      energy: ENERGY_MAX,
      maxEnergy: ENERGY_MAX,
      threat: 0,
      alive: true,
      targetId: null,
      forcedTargetId: null,
      forcedTargetRemaining: 0,
      action: "idle",
      attackRemaining: 0,
      cast: null,
      channel: null,
    });
  }

  setGroupStance(groupId: string, stance: CombatStance) {
    const group = this.groups.get(groupId);
    if (!group) return;
    group.stance = stance;
    this.resumeGroup(group);
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
    group.engagedFactionIds = [];
    for (const unit of this.units.values()) {
      if (unit.groupId !== groupId || !unit.alive) continue;
      this.interrupt(unit, "recalled");
      unit.targetId = null;
      unit.forcedTargetId = null;
      unit.forcedTargetRemaining = 0;
      unit.action = "returning";
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
    const group = this.groups.get(groupId);
    if (!unit || !group) return;
    unit.groupId = groupId;
    unit.ownerId = group.ownerId;
    unit.faction = group.faction;
  }

  removeGroup(groupId: string) {
    this.groups.delete(groupId);
  }

  configureUnit(id: string, config: { stats?: Partial<UnitStats>; abilities?: AbilityId[] }) {
    const unit = this.units.get(id);
    if (!unit) return false;
    if (config.stats) {
      const healthFraction = unit.maxHealth === 0 ? 0 : unit.health / unit.maxHealth;
      const energyFraction = unit.maxEnergy === 0 ? 0 : unit.energy / unit.maxEnergy;
      unit.stats = sanitizeStats({ ...unit.stats, ...config.stats });
      unit.maxHealth = maxHealth(unit.stats);
      unit.maxEnergy = ENERGY_MAX;
      unit.health = clamp(unit.maxHealth * healthFraction, 0, unit.maxHealth);
      unit.energy = clamp(unit.maxEnergy * energyFraction, 0, unit.maxEnergy);
    }
    if (config.abilities) {
      const abilities = this.validAbilities(config.abilities);
      unit.abilities = abilities;
      unit.cooldowns = Object.fromEntries(abilities.map((ability) => [ability, unit.cooldowns[ability] ?? 0]));
    }
    return true;
  }

  consumeEvents() {
    return this.eventsInternal.splice(0);
  }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.tick += 1;
    this.processCommands();
    this.updateComputerStances();
    this.advanceGroupMovement(dt);
    for (const unit of this.units.values()) this.advanceResources(unit, dt);
    this.advancePendingImpacts(dt);
    for (const unit of this.units.values()) this.advanceAction(unit, dt);
    for (const unit of this.units.values()) this.decide(unit, dt);
  }

  private validAbilities(abilities: AbilityId[]) {
    return [...new Set(abilities)].filter((ability) => abilityCatalog[ability] !== undefined);
  }

  private resumeGroup(group: CombatGroup) {
    group.recalled = false;
    for (const unit of this.units.values()) {
      if (unit.groupId === group.id && unit.alive && unit.action === "returning") unit.action = "idle";
    }
  }

  private processCommands() {
    for (const command of this.commands.splice(0)) {
      const group = this.groups.get(command.groupId);
      if (!group || group.ownerId !== command.ownerId) continue;
      if (command.type === "move") {
        group.moveTarget = clone(command.position);
        this.resumeGroup(group);
      } else if (command.type === "set-stance") {
        this.setGroupStance(command.groupId, command.stance);
      } else {
        this.recallGroup(command.groupId);
      }
    }
  }

  private advanceGroupMovement(dt: number) {
    for (const group of this.groups.values()) {
      if (!group.moveTarget) continue;
      const dx = group.moveTarget.x - group.anchor.x;
      const dz = group.moveTarget.z - group.anchor.z;
      const length = Math.hypot(dx, dz);
      if (length <= 0.02) {
        group.anchor = clone(group.moveTarget);
        group.moveTarget = null;
        continue;
      }
      const amount = Math.min(length, 10.5 * dt);
      group.anchor = { x: group.anchor.x + dx / length * amount, z: group.anchor.z + dz / length * amount };
    }
  }

  private advanceResources(unit: CombatUnit, dt: number) {
    if (!unit.alive) return;
    unit.energy = clamp(unit.energy + energyRegen(unit.stats) * dt, 0, unit.maxEnergy);
    unit.threat = clamp(unit.threat - THREAT_DECAY_PER_SECOND * dt, 0, THREAT_MAX);
    unit.attackRemaining = Math.max(0, unit.attackRemaining - dt);
    for (const id of unit.abilities) unit.cooldowns[id] = Math.max(0, (unit.cooldowns[id] ?? 0) - dt);
    if (unit.forcedTargetRemaining > 0) {
      unit.forcedTargetRemaining = Math.max(0, unit.forcedTargetRemaining - dt);
      if (unit.forcedTargetRemaining === 0) unit.forcedTargetId = null;
    }
  }

  private advancePendingImpacts(dt: number) {
    for (let index = this.pendingImpacts.length - 1; index >= 0; index -= 1) {
      const impact = this.pendingImpacts[index];
      impact.remaining -= dt;
      if (impact.remaining > 0) continue;
      this.pendingImpacts.splice(index, 1);
      const source = this.units.get(impact.sourceId);
      if (!source) continue;
      if (impact.kind === "area-damage") {
        if (impact.abilityId) this.emit({ type: "ability-impact", sourceId: source.id, abilityId: impact.abilityId, position: clone(impact.position), radius: impact.radius });
        this.damageArea(source, impact.position, impact.radius, impact.amount, impact.abilityId);
        continue;
      }
      const target = impact.targetId ? this.units.get(impact.targetId) : undefined;
      if (target?.alive && target.faction !== source.faction) this.damage(source, target, impact.amount, impact.abilityId);
    }
  }

  private advanceAction(unit: CombatUnit, dt: number) {
    if (!unit.alive) return;
    if (unit.cast) {
      unit.cast.remaining -= dt;
      if (unit.cast.remaining <= 0) {
        const cast = unit.cast;
        unit.cast = null;
        this.resolveAbility(unit, cast.abilityId, cast.targetId, cast.position);
      }
      return;
    }
    if (!unit.channel) return;
    const channel = unit.channel;
    channel.remaining -= dt;
    channel.tickRemaining -= dt;
    const spec = abilityCatalog[channel.abilityId];
    const totalTicks = Math.round((spec.channelDuration ?? 0) / (spec.tickInterval ?? 1));
    while (channel.tickRemaining <= 0 && channel.ticksApplied < totalTicks) {
      this.healArea(unit, channel.position, spec.radius, 12 + unit.stats.wisdom * 1.5, channel.abilityId);
      channel.ticksApplied += 1;
      channel.tickRemaining += spec.tickInterval ?? 1;
      this.emit({ type: "channel-tick", sourceId: unit.id, abilityId: "healer-healing-circle", position: clone(channel.position), radius: spec.radius });
    }
    if (channel.remaining <= 0) {
      this.emit({ type: "channel-ended", sourceId: unit.id, abilityId: "healer-healing-circle", position: clone(channel.position), radius: spec.radius });
      unit.channel = null;
      unit.action = "idle";
    }
  }

  private decide(unit: CombatUnit, dt: number) {
    if (!unit.alive || unit.cast || unit.channel) return;
    const group = this.groups.get(unit.groupId);
    if (!group) return;
    if (group.recalled) {
      unit.targetId = null;
      if (distance(unit.position, unit.home) > 0.1) {
        unit.action = "returning";
        this.move(unit, unit.home, 8, dt);
      } else {
        unit.position = clone(unit.home);
        unit.action = "idle";
      }
      return;
    }

    const target = this.selectHostileTarget(unit);
    unit.targetId = target?.id ?? null;
    const isForced = unit.forcedTargetRemaining > 0 && unit.forcedTargetId === target?.id;
    if (!isForced) {
      const ability = this.chooseAbility(unit, target, group.stance);
      if (ability) {
        this.beginAbility(unit, ability);
        return;
      }
    }
    if (!target) {
      unit.action = "idle";
      return;
    }

    const kind = this.autoAttackKind(unit);
    const range = kind === "sword" ? MELEE_AUTO_ATTACK_RANGE : RANGED_AUTO_ATTACK_RANGE;
    if (distance(unit.position, target.position) > range) {
      unit.action = "pursuing";
      this.move(unit, this.approachPoint(unit, target, kind), MOVEMENT_SPEED, dt);
      return;
    }
    this.face(unit, target.position);
    if (unit.attackRemaining === 0) this.autoAttack(unit, target, kind);
    else unit.action = "attacking";
  }

  private selectHostileTarget(unit: CombatUnit) {
    const hostiles = [...this.units.values()].filter((candidate) => candidate.alive && candidate.faction !== unit.faction);
    if (hostiles.length === 0) return undefined;
    const forced = unit.forcedTargetId ? this.units.get(unit.forcedTargetId) : undefined;
    if (forced?.alive && forced.faction !== unit.faction && unit.forcedTargetRemaining > 0) return forced;
    const group = this.groups.get(unit.groupId);
    if (!group) return undefined;
    for (const candidate of hostiles) {
      if (distance(unit.position, candidate.position) <= awarenessRange(unit.stats)) this.engage(group.id, candidate.faction);
    }
    const candidates = hostiles.filter((candidate) =>
      group.engagedFactionIds.includes(candidate.faction)
      && (candidate.id === unit.targetId || distance(unit.position, candidate.position) <= awarenessRange(unit.stats))
    );
    if (candidates.length === 0) return undefined;
    const highest = Math.max(...candidates.map((candidate) => candidate.threat));
    const current = candidates.find((candidate) => candidate.id === unit.targetId);
    if (current && current.threat >= highest - 0.0001) return current;
    return candidates.filter((candidate) => Math.abs(candidate.threat - highest) < 0.0001).sort((left, right) => left.id.localeCompare(right.id))[0];
  }

  private chooseAbility(unit: CombatUnit, hostileTarget: CombatUnit | undefined, stance: CombatStance) {
    const policy = stancePolicies[stance];
    const candidates = unit.abilities
      .filter((id) => (unit.cooldowns[id] ?? 0) === 0 && unit.energy >= abilityCatalog[id].energyCost)
      .map((id) => this.evaluateAbility(unit, id, hostileTarget, policy.scoreModifier))
      .filter((candidate): candidate is AbilityChoice => candidate !== undefined)
      .filter((candidate) => {
        const spec = abilityCatalog[candidate.id];
        const reserve = spec.costTier === "high" ? policy.highCostReserve : policy.lowCostReserve;
        return unit.energy - spec.energyCost >= reserve || (candidate.emergency && policy.emergencyOverridesReserve);
      });
    return candidates.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0];
  }

  private evaluateAbility(unit: CombatUnit, id: AbilityId, hostileTarget: CombatUnit | undefined, stanceModifier: number): AbilityChoice | undefined {
    const spec = abilityCatalog[id];
    const friendlies = [...this.units.values()].filter((candidate) => candidate.alive && candidate.faction === unit.faction);
    const hostiles = [...this.units.values()].filter((candidate) => candidate.alive && candidate.faction !== unit.faction && this.isEngagedHostile(unit, candidate));
    const highestFriendlyThreat = Math.max(0, ...friendlies.map((candidate) => candidate.threat));

    if (spec.behavior === "threat-boost") {
      if (!hostileTarget || (unit.threat >= 25 && unit.threat + 8 >= highestFriendlyThreat)) return undefined;
      return { id, targetId: unit.id, position: clone(unit.position), score: 72 + stanceModifier, emergency: false };
    }
    if (spec.behavior === "taunt") {
      const targets = hostiles.filter((candidate) => candidate.targetId !== null && distance(unit.position, candidate.position) <= spec.maximumRange && candidate.targetId !== unit.id);
      const target = targets.sort((left, right) => this.tauntPriority(right, unit) - this.tauntPriority(left, unit) || left.id.localeCompare(right.id))[0];
      if (!target) return undefined;
      const victim = target.targetId ? this.units.get(target.targetId) : undefined;
      const emergency = Boolean(victim && victim.health / victim.maxHealth < 0.45);
      return { id, targetId: target.id, position: clone(target.position), score: 98 + (emergency ? 20 : 0), emergency };
    }
    if (spec.behavior === "area-damage") {
      const nearby = hostiles.filter((candidate) => distance(unit.position, candidate.position) <= spec.radius);
      if (nearby.length < (stanceModifier > 0 ? 1 : 2)) return undefined;
      return { id, targetId: hostileTarget?.id ?? nearby[0].id, position: clone(unit.position), score: 44 + nearby.length * 7 + stanceModifier, emergency: false };
    }
    if (spec.behavior === "backstab" || spec.behavior === "projectile-damage") {
      const target = hostileTarget && distance(unit.position, hostileTarget.position) <= spec.maximumRange ? hostileTarget : undefined;
      if (!target) return undefined;
      const base = spec.behavior === "backstab" ? 64 : 38;
      return { id, targetId: target.id, position: clone(target.position), score: base + stanceModifier, emergency: false };
    }
    if (spec.behavior === "area-projectile-damage") {
      const centers = hostiles.filter((candidate) => distance(unit.position, candidate.position) <= spec.maximumRange);
      const cluster = centers
        .map((center) => ({ center, count: hostiles.filter((candidate) => distance(center.position, candidate.position) <= spec.radius).length }))
        .sort((left, right) => right.count - left.count || left.center.id.localeCompare(right.center.id))[0];
      if (!cluster || cluster.count < 3) return undefined;
      return { id, targetId: cluster.center.id, position: clone(cluster.center.position), score: 70 + cluster.count * 7 + stanceModifier, emergency: false };
    }
    if (spec.behavior === "single-heal") {
      const target = this.lowestHealthAlly(unit, spec.maximumRange);
      if (!target || target.health / target.maxHealth >= 0.82) return undefined;
      const fraction = target.health / target.maxHealth;
      return { id, targetId: target.id, position: clone(target.position), score: fraction < 0.4 ? 112 : 56 - fraction * 10, emergency: fraction < 0.4 };
    }
    if (spec.behavior === "healing-circle") {
      const centers = friendlies.filter((candidate) => distance(unit.position, candidate.position) <= spec.maximumRange);
      const cluster = centers
        .map((center) => {
          const covered = friendlies.filter((candidate) => distance(center.position, candidate.position) <= spec.radius && candidate.health < candidate.maxHealth * 0.9);
          const urgency = covered.reduce((sum, candidate) => sum + (1 - candidate.health / candidate.maxHealth), 0);
          return { center, covered, urgency };
        })
        .sort((left, right) => right.urgency - left.urgency || left.center.id.localeCompare(right.center.id))[0];
      if (!cluster) return undefined;
      const critical = cluster.covered.filter((candidate) => candidate.health / candidate.maxHealth < 0.4).length;
      if (cluster.covered.length < 3 && critical < 2) return undefined;
      return { id, targetId: cluster.center.id, position: clone(cluster.center.position), score: 84 + cluster.urgency * 20, emergency: critical >= 2 };
    }
    return undefined;
  }

  private beginAbility(unit: CombatUnit, choice: AbilityChoice) {
    const spec = abilityCatalog[choice.id];
    unit.energy = clamp(unit.energy - spec.energyCost, 0, unit.maxEnergy);
    unit.cooldowns[choice.id] = spec.cooldownSeconds;
    unit.action = "casting";
    this.addThreat(unit, spec.baseThreat);
    this.face(unit, choice.position);
    this.emit({
      type: "cast-started",
      sourceId: unit.id,
      abilityId: choice.id,
      targetId: choice.targetId,
      sourcePosition: clone(unit.position),
      targetPosition: clone(choice.position),
      duration: spec.castTime,
    });
    unit.cast = { abilityId: choice.id, targetId: choice.targetId, position: clone(choice.position), remaining: spec.castTime };
  }

  private resolveAbility(unit: CombatUnit, abilityId: AbilityId, targetId: string | null, position: Vec2) {
    const spec = abilityCatalog[abilityId];
    const target = targetId ? this.units.get(targetId) : undefined;
    if (spec.behavior === "threat-boost") {
      this.emit({ type: "ability-impact", sourceId: unit.id, abilityId, position: clone(unit.position), radius: spec.radius });
      unit.action = "idle";
      return;
    }
    if (spec.behavior === "taunt") {
      if (!this.validTargetInRange(unit, target, spec.maximumRange, false)) return this.failResolution(unit, abilityId);
      this.interrupt(target!, "taunted");
      target!.forcedTargetId = unit.id;
      target!.forcedTargetRemaining = TAUNT_DURATION_SECONDS;
      target!.targetId = unit.id;
      target!.action = "idle";
      const highest = Math.max(0, ...[...this.units.values()].filter((candidate) => candidate.alive && candidate.faction === unit.faction).map((candidate) => candidate.threat));
      unit.threat = clamp(Math.max(unit.threat, highest + 1), 0, THREAT_MAX);
      this.emit({ type: "taunt", sourceId: unit.id, targetId: target!.id, sourcePosition: clone(unit.position), targetPosition: clone(target!.position), duration: TAUNT_DURATION_SECONDS });
      unit.action = "idle";
      return;
    }
    if (spec.behavior === "area-damage") {
      this.emit({ type: "ability-impact", sourceId: unit.id, abilityId, position: clone(unit.position), radius: spec.radius });
      this.damageArea(unit, unit.position, spec.radius, 10 + unit.stats.strength * 0.65, abilityId);
      unit.action = "idle";
      return;
    }
    if (spec.behavior === "backstab") {
      if (!this.validTargetInRange(unit, target, spec.maximumRange, false)) return this.failResolution(unit, abilityId);
      const from = clone(unit.position);
      const dx = target!.position.x - unit.position.x;
      const dz = target!.position.z - unit.position.z;
      const length = Math.max(0.01, Math.hypot(dx, dz));
      unit.position = { x: target!.position.x + dx / length * 1.05, z: target!.position.z + dz / length * 1.05 };
      this.face(unit, target!.position);
      this.emit({ type: "teleport", unitId: unit.id, abilityId: "melee-backstab", from, to: clone(unit.position) });
      this.emit({ type: "ability-impact", sourceId: unit.id, abilityId, position: clone(target!.position), radius: 1 });
      this.damage(unit, target!, 24 + unit.stats.strength + unit.stats.agility * 0.35, abilityId);
      unit.action = "idle";
      return;
    }
    if (spec.behavior === "projectile-damage") {
      if (!this.validTargetInRange(unit, target, spec.maximumRange, false)) return this.failResolution(unit, abilityId);
      const travel = clamp(distance(unit.position, target!.position) / 18, 0.2, 0.65);
      this.emit({ type: "projectile-launched", sourceId: unit.id, targetId: target!.id, abilityId, kind: "fireball", sourcePosition: clone(unit.position), targetPosition: clone(target!.position), duration: travel });
      this.pendingImpacts.push({ remaining: travel, sourceId: unit.id, targetId: target!.id, position: clone(target!.position), amount: 14 + unit.stats.intelligence, radius: 0, abilityId, kind: "single-damage" });
      unit.action = "idle";
      return;
    }
    if (spec.behavior === "area-projectile-damage") {
      if (distance(unit.position, position) > spec.maximumRange) return this.failResolution(unit, abilityId);
      const travel = 0.65;
      this.emit({ type: "projectile-launched", sourceId: unit.id, targetId, abilityId, kind: "meteor", sourcePosition: clone(unit.position), targetPosition: clone(position), duration: travel });
      this.pendingImpacts.push({ remaining: travel, sourceId: unit.id, targetId: null, position: clone(position), amount: 28 + unit.stats.intelligence, radius: spec.radius, abilityId, kind: "area-damage" });
      unit.action = "idle";
      return;
    }
    if (spec.behavior === "single-heal") {
      if (!this.validTargetInRange(unit, target, spec.maximumRange, true)) return this.failResolution(unit, abilityId);
      this.heal(unit, target!, 22 + unit.stats.wisdom * 1.35, abilityId);
      unit.action = "idle";
      return;
    }
    if (distance(unit.position, position) > spec.maximumRange) return this.failResolution(unit, abilityId);
    unit.channel = { abilityId: "healer-healing-circle", position: clone(position), remaining: spec.channelDuration ?? 5, tickRemaining: 0, ticksApplied: 0 };
    unit.action = "channeling";
    this.emit({ type: "channel-started", sourceId: unit.id, abilityId: "healer-healing-circle", position: clone(position), radius: spec.radius });
  }

  private failResolution(unit: CombatUnit, abilityId: AbilityId) {
    this.emit({ type: "action-interrupted", unitId: unit.id, abilityId, position: clone(unit.position), reason: "invalid-target" });
    unit.action = "idle";
  }

  private autoAttack(unit: CombatUnit, target: CombatUnit, kind: AutoAttackKind) {
    const damage = kind === "sword" ? 4 + unit.stats.strength * 0.5 : 4 + unit.stats.intelligence * 0.45;
    const duration = kind === "sword" ? 0.18 : clamp(distance(unit.position, target.position) / 22, 0.2, 0.55);
    this.emit({ type: "auto-attack", sourceId: unit.id, targetId: target.id, kind, sourcePosition: clone(unit.position), targetPosition: clone(target.position), duration });
    if (kind === "wand") {
      this.emit({ type: "projectile-launched", sourceId: unit.id, targetId: target.id, abilityId: null, kind: "wand", sourcePosition: clone(unit.position), targetPosition: clone(target.position), duration });
    }
    this.pendingImpacts.push({ remaining: duration, sourceId: unit.id, targetId: target.id, position: clone(target.position), amount: damage, radius: 0, abilityId: null, kind: "single-damage" });
    unit.attackRemaining = attackInterval(unit.stats, kind === "sword" ? 2.15 : 2.45);
    unit.action = "attacking";
  }

  private damageArea(source: CombatUnit, position: Vec2, radius: number, amount: number, abilityId: AbilityId | null) {
    for (const target of this.units.values()) {
      if (target.alive && target.faction !== source.faction && distance(target.position, position) <= radius) this.damage(source, target, amount, abilityId);
    }
  }

  private healArea(source: CombatUnit, position: Vec2, radius: number, amount: number, abilityId: AbilityId) {
    for (const target of this.units.values()) {
      if (target.alive && target.faction === source.faction && distance(target.position, position) <= radius) this.heal(source, target, amount, abilityId);
    }
  }

  private damage(source: CombatUnit, target: CombatUnit, amount: number, abilityId: AbilityId | null) {
    this.engage(source.groupId, target.faction);
    this.engage(target.groupId, source.faction);
    const applied = Math.min(amount, target.health);
    if (applied <= 0) return;
    target.health -= applied;
    this.addThreat(source, applied * DAMAGE_THREAT_MULTIPLIER);
    this.emit({ type: "damage", sourceId: source.id, targetId: target.id, amount: applied, sourcePosition: clone(source.position), targetPosition: clone(target.position), abilityId });
    if (target.health > 0) return;
    this.interrupt(target, "dead");
    target.alive = false;
    target.action = "dead";
    target.targetId = null;
    target.forcedTargetId = null;
    target.forcedTargetRemaining = 0;
    this.emit({ type: "death", unitId: target.id, position: clone(target.position) });
  }

  private heal(source: CombatUnit, target: CombatUnit, amount: number, abilityId: AbilityId) {
    const applied = Math.min(amount, target.maxHealth - target.health);
    if (applied <= 0) return;
    target.health += applied;
    this.addThreat(source, applied * HEALING_THREAT_MULTIPLIER);
    this.emit({ type: "heal", sourceId: source.id, targetId: target.id, amount: applied, sourcePosition: clone(source.position), targetPosition: clone(target.position), abilityId });
  }

  private interrupt(unit: CombatUnit, reason: "taunted" | "recalled" | "dead") {
    const abilityId = unit.cast?.abilityId ?? unit.channel?.abilityId ?? null;
    if (unit.cast || unit.channel) this.emit({ type: "action-interrupted", unitId: unit.id, abilityId, position: clone(unit.position), reason });
    unit.cast = null;
    unit.channel = null;
  }

  private addThreat(unit: CombatUnit, amount: number) {
    if (unit.alive) unit.threat = clamp(unit.threat + amount, 0, THREAT_MAX);
  }

  private engage(groupId: string, hostileFaction: CombatFaction) {
    const group = this.groups.get(groupId);
    if (!group || group.faction === hostileFaction || group.recalled) return;
    if (!group.engagedFactionIds.includes(hostileFaction)) group.engagedFactionIds.push(hostileFaction);
  }

  private isEngagedHostile(unit: CombatUnit, candidate: CombatUnit) {
    return this.groups.get(unit.groupId)?.engagedFactionIds.includes(candidate.faction) ?? false;
  }

  private validTargetInRange(unit: CombatUnit, target: CombatUnit | undefined, maximumRange: number, friendly: boolean) {
    return Boolean(target?.alive && (target.faction === unit.faction) === friendly && distance(unit.position, target.position) <= maximumRange);
  }

  private lowestHealthAlly(unit: CombatUnit, maximumRange: number) {
    return [...this.units.values()]
      .filter((candidate) => candidate.alive && candidate.faction === unit.faction && distance(unit.position, candidate.position) <= maximumRange)
      .sort((left, right) => left.health / left.maxHealth - right.health / right.maxHealth || left.id.localeCompare(right.id))[0];
  }

  private tauntPriority(target: CombatUnit, tank: CombatUnit) {
    const victim = target.targetId ? this.units.get(target.targetId) : undefined;
    if (!victim || victim.id === tank.id) return 0;
    return 100 - victim.health / victim.maxHealth * 40 + victim.threat;
  }

  private autoAttackKind(unit: CombatUnit): AutoAttackKind {
    return unit.role === "tank" || unit.role === "melee" ? "sword" : "wand";
  }

  private approachPoint(unit: CombatUnit, target: CombatUnit, kind: AutoAttackKind) {
    if (kind === "wand") return target.position;
    const hash = [...unit.id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 17);
    const angle = hash % 6283 / 1000;
    const radius = 1.25 + hash % 3 * 0.12;
    return { x: target.position.x + Math.cos(angle) * radius, z: target.position.z + Math.sin(angle) * radius };
  }

  private face(unit: CombatUnit, target: Vec2) {
    const dx = target.x - unit.position.x;
    const dz = target.z - unit.position.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.001) unit.facing = { x: dx / length, z: dz / length };
  }

  private move(unit: CombatUnit, target: Vec2, speed: number, dt: number) {
    this.face(unit, target);
    const dx = target.x - unit.position.x;
    const dz = target.z - unit.position.z;
    const length = Math.hypot(dx, dz);
    if (length <= 0.001) return;
    const amount = Math.min(length, speed * dt);
    unit.position = { x: unit.position.x + dx / length * amount, z: unit.position.z + dz / length * amount };
  }

  private updateComputerStances() {
    for (const group of this.groups.values()) {
      if (group.controller !== "computer" || group.recalled) continue;
      const members = [...this.units.values()].filter((unit) => unit.groupId === group.id && unit.alive);
      if (members.length === 0) continue;
      const healthFraction = members.reduce((total, unit) => total + unit.health / unit.maxHealth, 0) / members.length;
      if (group.stance === "balanced") {
        if (healthFraction < 0.35) group.stance = "defensive";
        else if (healthFraction > 0.78) group.stance = "aggressive";
      } else if (group.stance === "defensive" && healthFraction > 0.5) {
        group.stance = "balanced";
      } else if (group.stance === "aggressive" && healthFraction < 0.65) {
        group.stance = "balanced";
      }
    }
  }

  private emit(event: UntickedCombatEvent) {
    this.eventsInternal.push({ ...event, tick: this.tick } as CombatEvent);
  }
}
