import * as THREE from "three";
import { WORLD_HALF_WIDTH } from "../../config";
import type { FormationType, PartyCommand, PartyRole } from "../../types";
import { abilityDefinitions } from "../abilities/abilityDefinitions";
import { CombatSimulation } from "../combat/CombatSimulation";
import { roleStats } from "../combat/combatBalance";
import { abilityCatalog, starterAbilityLoadouts } from "../combat/abilityCatalog";
import type { AbilityId, CombatRole, CombatStance, UnitStats } from "../combat/types";
import { PartyGroup } from "./PartyGroup";
import { PartyMember } from "./PartyMember";

export class PartyController {
  readonly group = new THREE.Group();
  private readonly moveInput = new THREE.Vector2();
  private readonly membersInternal: PartyMember[];
  private readonly enemiesInternal: PartyMember[];
  readonly combat = new CombatSimulation();
  private readonly mainGroup: PartyGroup;
  private readonly groupsInternal: PartyGroup[];
  private lastFormationMessage = "Triangle formation";
  private groupSequence = 0;
  private combatAccumulator = 0;
  private moving = false;

  constructor() {
    this.group.name = "Party";
    this.membersInternal = [
      this.createMember("tank-1", "Bram", "tank", abilityDefinitions.tankTaunt),
      this.createMember("tank-2", "Orrin", "tank", abilityDefinitions.tankTaunt),
      this.createMember("melee-1", "Kest", "melee", abilityDefinitions.meleeWhirlwind),
      this.createMember("melee-2", "Veya", "melee", abilityDefinitions.meleeWhirlwind),
      this.createMember("melee-3", "Jax", "melee", abilityDefinitions.meleeWhirlwind),
      this.createMember("ranged-1", "Iria", "ranged", abilityDefinitions.rangedFireball),
      this.createMember("ranged-2", "Sol", "ranged", abilityDefinitions.rangedFireball),
      this.createMember("ranged-3", "Nilo", "ranged", abilityDefinitions.rangedFireball),
      this.createMember("healer-1", "Mira", "healer", abilityDefinitions.healerHeal),
      this.createMember("healer-2", "Senn", "healer", abilityDefinitions.healerHeal),
    ];
    this.mainGroup = new PartyGroup("main", true, this.membersInternal);
    this.mainGroup.position.x = -WORLD_HALF_WIDTH + 12;
    this.groupsInternal = [this.mainGroup];
    this.group.add(this.mainGroup.group);
    this.mainGroup.update(0);
    this.combat.addGroup("main", "party", "balanced", "player-1");
    this.membersInternal.forEach((member) => this.addCombatMember(member, "party", "main"));
    this.combat.addGroup("enemy-main", "enemy", "aggressive", "cpu-1");
    this.enemiesInternal = [
      this.createMember("enemy-melee-1", "Raider", "melee", abilityDefinitions.meleeWhirlwind),
      this.createMember("enemy-ranged-1", "Hexer", "ranged", abilityDefinitions.rangedFireball),
      this.createMember("enemy-tank-1", "Brute", "tank", abilityDefinitions.tankTaunt),
      this.createMember("enemy-healer-1", "Acolyte", "healer", abilityDefinitions.healerHeal),
    ];
    this.enemiesInternal.forEach((member, index) => {
      member.position.set(-WORLD_HALF_WIDTH + 27 + index * 1.5, 0, index % 2 === 0 ? -2 : 2);
      this.group.add(member.group);
      member.refreshWorldPosition();
      this.addCombatMember(member, "enemy", "enemy-main");
    });
  }

  get position() {
    return this.mainGroup.position;
  }

  get members() {
    return this.membersInternal;
  }

  get enemies() { return this.enemiesInternal; }

  get groups() {
    return this.groupsInternal;
  }

  get formation() {
    return this.mainGroup.formation;
  }

  get formationMessage() {
    return this.lastFormationMessage;
  }

  get headingAngle() {
    return this.mainGroup.headingAngle;
  }

  setMoveInput(input: THREE.Vector2) {
    this.moveInput.copy(input);
    if (this.moveInput.lengthSq() > 1) {
      this.moveInput.normalize();
    }
  }

  setFormation(groupId: string, formation: FormationType) {
    const partyGroup = this.groupsInternal.find((candidate) => candidate.id === groupId);
    if (!partyGroup?.setFormation(formation)) {
      return;
    }
    this.lastFormationMessage = `${this.formatFormationName(formation)} formation`;
  }

  update(dt: number) {
    this.moving = this.moveInput.lengthSq() > 0;
    this.mainGroup.update(dt, this.moveInput);
    this.groupsInternal.filter((partyGroup) => !partyGroup.isMain).forEach((partyGroup) => partyGroup.update(dt, this.moveInput));
    this.membersInternal.forEach((member) => {
      member.refreshWorldPosition();
      if (!member.inCombat) this.combat.setUnitHome(member.id, { x: member.worldPosition.x, z: member.worldPosition.z });
      this.combat.setUnitPosition(member.id, { x: member.worldPosition.x, z: member.worldPosition.z });
    });
    this.enemiesInternal.forEach((member) => {
      member.refreshWorldPosition();
      this.combat.setUnitPosition(member.id, { x: member.worldPosition.x, z: member.worldPosition.z });
    });
    this.combatAccumulator = Math.min(this.combatAccumulator + dt, 0.2);
    while (this.combatAccumulator >= 1 / 30) {
      this.combat.update(1 / 30);
      this.combatAccumulator -= 1 / 30;
    }
    [...this.membersInternal, ...this.enemiesInternal].forEach((member) => this.syncCombatMember(member));
  }

  isMoving() {
    return this.moving;
  }

  issueRoleCommand(role: PartyRole, command: PartyCommand, target: THREE.Vector3) {
    const partyGroup = this.groupForRole(role);
    if (!partyGroup) {
      return;
    }

    const movingGroup = partyGroup.isMain ? this.detachRole(role) ?? partyGroup : partyGroup;
    movingGroup.setMoveTarget(target);
  }

  returnGroup(groupId: string) {
    const detachedGroup = this.groupsInternal.find((candidate) => candidate.id === groupId && !candidate.isMain);
    if (!detachedGroup) {
      return;
    }

    this.group.updateMatrixWorld(true);
    const members = [...detachedGroup.members];
    const worldPositions = new Map<string, THREE.Vector3>();
    members.forEach((member) => worldPositions.set(member.id, member.worldPosition.clone()));
    detachedGroup.releaseMembers(members);
    for (const member of members) {
      const localPosition = this.mainGroup.group.worldToLocal(worldPositions.get(member.id)?.clone() ?? new THREE.Vector3());
      this.mainGroup.addMembers([member]);
      member.position.copy(localPosition);
      this.combat.setUnitGroup(member.id, this.mainGroup.id);
    }
    this.mainGroup.sortMembers((left, right) => this.membersInternal.indexOf(left) - this.membersInternal.indexOf(right));
    this.group.remove(detachedGroup.group);
    this.groupsInternal.splice(this.groupsInternal.indexOf(detachedGroup), 1);
    this.lastFormationMessage = "Party reunited";
  }

  setStance(groupId: string, stance: CombatStance) {
    this.combat.setGroupStance(groupId, stance);
    this.lastFormationMessage = `${stance.charAt(0).toUpperCase()}${stance.slice(1)} stance`;
  }

  recallGroup(groupId: string) {
    this.combat.recallGroup(groupId);
    this.lastFormationMessage = "Returning to formation";
  }

  getGroupStance(groupId: string): CombatStance {
    return this.combat.groups.get(groupId)?.stance ?? "balanced";
  }

  getAbilityStatus(memberId: string) {
    const unit = this.combat.units.get(memberId);
    if (!unit) return "";
    return unit.abilities.map((id) => {
      const cooldown = unit.cooldowns[id];
      return cooldown > 0 ? `${abilityCatalog[id].label} ${cooldown.toFixed(1)}s` : `${abilityCatalog[id].label} ready`;
    }).join(" · ");
  }

  configureMember(memberId: string, config: { stats?: Partial<UnitStats>; abilities?: AbilityId[] }) {
    return this.combat.configureUnit(memberId, config);
  }

  getLowestHealthMember() {
    return this.membersInternal.reduce((lowest, member) => (member.health < lowest.health ? member : lowest));
  }

  private detachRole(role: PartyRole) {
    const members = this.mainGroup.members.filter((member) => member.role === role);
    if (members.length === 0) {
      return;
    }
    const detachedGroup = new PartyGroup(`group-${this.groupSequence += 1}`, false, [], this.mainGroup.headingAngle);
    detachedGroup.position.copy(this.mainGroup.position);
    this.mainGroup.releaseMembers(members);
    detachedGroup.addMembers(members);
    this.groupsInternal.push(detachedGroup);
    this.group.add(detachedGroup.group);
    this.combat.addGroup(detachedGroup.id, "party", this.getGroupStance("main"), "player-1");
    members.forEach((member) => this.combat.setUnitGroup(member.id, detachedGroup.id));
    return detachedGroup;
  }

  private groupForRole(role: PartyRole) {
    return this.groupsInternal.find((partyGroup) => partyGroup.containsRole(role));
  }

  private addCombatMember(member: PartyMember, faction: "party" | "enemy", groupId: string) {
    const role = member.role as CombatRole;
    this.combat.addUnit({ id: member.id, name: member.displayName, faction, role, groupId, position: { x: member.worldPosition.x, z: member.worldPosition.z }, stats: roleStats[role], abilities: starterAbilityLoadouts[role] });
  }

  private syncCombatMember(member: PartyMember) {
    const state = this.combat.units.get(member.id);
    if (!state) return;
    const parent = member.group.parent;
    if (parent) {
      parent.updateMatrixWorld(true);
      const local = parent.worldToLocal(new THREE.Vector3(state.position.x, 0, state.position.z));
      member.position.copy(local);
    } else {
      member.position.set(state.position.x, 0, state.position.z);
    }
    member.syncCombat({ health: state.health, maxHealth: state.maxHealth, energy: state.energy, maxEnergy: state.maxEnergy, threat: state.threat, action: state.action, inCombat: state.targetId !== null || state.action !== "idle" });
  }

  private createMember(id: string, displayName: string, role: PartyRole, ability: PartyMember["abilities"][number]) {
    return new PartyMember({ id, displayName, role, ability });
  }

  private formatFormationName(formation: FormationType) {
    return formation.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  }
}
