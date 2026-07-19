import * as THREE from "three";
import { PARTY_SPEED, WORLD_BOUNDS } from "../../config";
import { clamp } from "../../lib/math";
import type { FormationType, PartyCommand, PartyRole } from "../../types";
import { AbilitySystem } from "../abilities/AbilitySystem";
import { abilityDefinitions } from "../abilities/abilityDefinitions";
import type { AbilityResult, AbilityTarget } from "../abilities/types";
import { PartyMember } from "./PartyMember";
import { buildFormationSlots } from "./FormationLayouts";

type RoleOrder = {
  target: THREE.Vector3;
};

export class PartyController {
  readonly group = new THREE.Group();
  readonly position = this.group.position;

  private readonly moveInput = new THREE.Vector2();
  private readonly membersInternal: PartyMember[];
  private readonly abilitySystem: AbilitySystem;
  private readonly roleOrders = new Map<PartyRole, RoleOrder>();
  private formationSlots = new Map<string, THREE.Vector3>();
  private currentFormation: FormationType = "triangle";
  private lastFormationMessage = "Triangle formation";
  private moving = false;
  private heading = Math.PI / 4;

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
    this.abilitySystem = new AbilitySystem(() => this.membersInternal);
    this.membersInternal.forEach((member) => this.group.add(member.group));
    this.formationSlots = buildFormationSlots(this.currentFormation, this.membersInternal);
    this.applyFormationSlots(0);
  }

  get members() {
    return this.membersInternal;
  }

  get formation() {
    return this.currentFormation;
  }

  get formationMessage() {
    return this.lastFormationMessage;
  }

  get headingAngle() {
    return this.heading;
  }

  setMoveInput(input: THREE.Vector2) {
    this.moveInput.copy(input);
    if (this.moveInput.lengthSq() > 1) {
      this.moveInput.normalize();
    }
  }

  setFormation(formation: FormationType) {
    if (formation === this.currentFormation) {
      return;
    }
    this.currentFormation = formation;
    this.formationSlots = buildFormationSlots(this.currentFormation, this.membersInternal);
    this.lastFormationMessage = `${this.formatFormationName(formation)} formation`;
  }

  update(dt: number) {
    const direction = new THREE.Vector3(this.moveInput.x, 0, this.moveInput.y);
    this.moving = direction.lengthSq() > 0;
    const previousPosition = this.position.clone();
    if (this.moving) {
      this.position.addScaledVector(direction, PARTY_SPEED * dt);
      this.position.x = clamp(this.position.x, -WORLD_BOUNDS, WORLD_BOUNDS);
      this.position.z = clamp(this.position.z, -WORLD_BOUNDS, WORLD_BOUNDS);
      this.heading = Math.atan2(-direction.x, -direction.z);
    }

    const movementDelta = this.position.clone().sub(previousPosition);
    if (movementDelta.lengthSq() > 0) {
      this.translateMoveOrders(movementDelta);
    }

    this.group.updateMatrixWorld(true);
    this.applyFormationSlots(dt);
    this.group.updateMatrixWorld(true);
    this.membersInternal.forEach((member) => member.refreshWorldPosition());
    this.abilitySystem.update(dt);
  }

  isMoving() {
    return this.moving;
  }

  issueRoleCommand(role: PartyRole, command: PartyCommand, target: THREE.Vector3) {
    this.roleOrders.set(role, { target: target.clone() });
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
    const ability = member.abilities[0];
    return this.abilitySystem.getCooldown(member, ability);
  }

  getLowestHealthMember() {
    return this.membersInternal.reduce((lowest, member) => (member.health < lowest.health ? member : lowest));
  }

  getAbilityResultMessage(result: AbilityResult | undefined) {
    return result?.message ?? this.lastFormationMessage;
  }

  private applyFormationSlots(dt: number) {
    for (const member of this.membersInternal) {
      const roleOrder = this.roleOrders.get(member.role);
      const desiredWorld = this.desiredWorldPosition(member, roleOrder);
      const desiredLocal = this.group.worldToLocal(desiredWorld);
      member.update(dt, desiredLocal);
    }
  }

  private desiredWorldPosition(member: PartyMember, roleOrder: RoleOrder | undefined) {
    if (roleOrder) {
      const roleMembers = this.membersForRole(member.role);
      const index = roleMembers.findIndex((candidate) => candidate.id === member.id);
      const offset = new THREE.Vector3((index - (roleMembers.length - 1) / 2) * 1.05, 0, 0);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
      return roleOrder.target.clone().add(offset);
    }

    const slot = this.formationSlots.get(member.id) ?? new THREE.Vector3();
    const rotatedSlot = slot.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    return this.group.localToWorld(rotatedSlot);
  }

  private translateMoveOrders(delta: THREE.Vector3) {
    for (const order of this.roleOrders.values()) {
      order.target.add(delta);
    }
  }

  private membersForRole(role: PartyRole) {
    return this.membersInternal.filter((member) => member.role === role);
  }

  private createMember(id: string, displayName: string, role: PartyRole, ability: PartyMember["abilities"][number]) {
    return new PartyMember({ id, displayName, role, ability });
  }

  private formatFormationName(formation: FormationType) {
    return formation
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
}
