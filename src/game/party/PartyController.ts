import * as THREE from "three";
import type { FormationType, PartyCommand, PartyRole } from "../../types";
import { AbilitySystem } from "../abilities/AbilitySystem";
import { abilityDefinitions } from "../abilities/abilityDefinitions";
import type { AbilityResult, AbilityTarget } from "../abilities/types";
import { PartyGroup } from "./PartyGroup";
import { PartyMember } from "./PartyMember";

export class PartyController {
  readonly group = new THREE.Group();
  private readonly moveInput = new THREE.Vector2();
  private readonly membersInternal: PartyMember[];
  private readonly abilitySystem: AbilitySystem;
  private readonly mainGroup: PartyGroup;
  private readonly groupsInternal: PartyGroup[];
  private lastFormationMessage = "Triangle formation";
  private groupSequence = 0;
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
    this.groupsInternal = [this.mainGroup];
    this.group.add(this.mainGroup.group);
    this.abilitySystem = new AbilitySystem(() => this.membersInternal);
  }

  get position() {
    return this.mainGroup.position;
  }

  get members() {
    return this.membersInternal;
  }

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
    this.abilitySystem.update(dt);
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
    }
    this.mainGroup.sortMembers((left, right) => this.membersInternal.indexOf(left) - this.membersInternal.indexOf(right));
    this.group.remove(detachedGroup.group);
    this.groupsInternal.splice(this.groupsInternal.indexOf(detachedGroup), 1);
    this.lastFormationMessage = "Party reunited";
  }

  useRoleAbility(role: PartyRole, target?: AbilityTarget) {
    const member = this.membersInternal.find((candidate) => candidate.role === role);
    const ability = member?.abilities[0];
    if (!member || !ability) {
      return;
    }
    const result = this.abilitySystem.use(member, ability, target);
    this.lastFormationMessage = result.message;
    return result;
  }

  getAbilityCooldown(member: PartyMember) {
    return this.abilitySystem.getCooldown(member, member.abilities[0]);
  }

  getLowestHealthMember() {
    return this.membersInternal.reduce((lowest, member) => (member.health < lowest.health ? member : lowest));
  }

  getAbilityResultMessage(result: AbilityResult | undefined) {
    return result?.message ?? this.lastFormationMessage;
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
    return detachedGroup;
  }

  private groupForRole(role: PartyRole) {
    return this.groupsInternal.find((partyGroup) => partyGroup.containsRole(role));
  }

  private createMember(id: string, displayName: string, role: PartyRole, ability: PartyMember["abilities"][number]) {
    return new PartyMember({ id, displayName, role, ability });
  }

  private formatFormationName(formation: FormationType) {
    return formation.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  }
}
