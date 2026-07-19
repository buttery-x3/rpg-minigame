import * as THREE from "three";
import { PARTY_SPEED, WORLD_HALF_HEIGHT, WORLD_HALF_WIDTH } from "../../config";
import { clamp } from "../../lib/math";
import type { FormationType, PartyRole } from "../../types";
import { buildFormationSlots } from "./FormationLayouts";
import { PartyMember } from "./PartyMember";

export class PartyGroup {
  readonly group = new THREE.Group();
  private readonly membersInternal: PartyMember[];
  private formationSlots = new Map<string, THREE.Vector3>();
  private currentFormation: FormationType = "triangle";
  private moveTarget: THREE.Vector3 | null = null;
  private heading = Math.PI / 4;

  constructor(
    readonly id: string,
    readonly isMain: boolean,
    members: readonly PartyMember[],
    heading = Math.PI / 4,
  ) {
    this.group.name = id;
    this.membersInternal = [...members];
    this.heading = heading;
    this.membersInternal.forEach((member) => this.group.add(member.group));
    this.rebuildFormation();
    this.applyFormation(0);
  }

  get position() {
    return this.group.position;
  }

  get members() {
    return this.membersInternal;
  }

  get formation() {
    return this.currentFormation;
  }

  get headingAngle() {
    return this.heading;
  }

  get roles() {
    return [...new Set(this.membersInternal.map((member) => member.role))];
  }

  containsRole(role: PartyRole) {
    return this.membersInternal.some((member) => member.role === role);
  }

  setFormation(formation: FormationType) {
    if (formation === this.currentFormation) {
      return false;
    }
    this.currentFormation = formation;
    this.rebuildFormation();
    return true;
  }

  setMoveTarget(target: THREE.Vector3) {
    this.moveTarget = target.clone();
  }

  update(dt: number, moveInput?: THREE.Vector2) {
    const direction = moveInput ? new THREE.Vector3(moveInput.x, 0, moveInput.y) : new THREE.Vector3();
    if (direction.lengthSq() > 0) {
      const amount = PARTY_SPEED * dt;
      const normalizedDirection = direction.normalize();
      this.moveBy(normalizedDirection, amount);
      if (this.moveTarget) {
        this.moveTarget.addScaledVector(normalizedDirection, amount);
      }
      this.heading = Math.atan2(-direction.x, -direction.z);
    } else if (this.moveTarget) {
      const delta = this.moveTarget.clone().sub(this.position);
      delta.y = 0;
      const distance = delta.length();
      if (distance <= 0.02) {
        this.position.copy(this.moveTarget);
        this.moveTarget = null;
      } else {
        this.moveBy(delta.normalize(), Math.min(distance, PARTY_SPEED * dt));
        this.heading = Math.atan2(-delta.x, -delta.z);
      }
    }

    this.group.updateMatrixWorld(true);
    this.applyFormation(dt);
    this.group.updateMatrixWorld(true);
    this.membersInternal.forEach((member) => member.refreshWorldPosition());
  }

  releaseMembers(members: readonly PartyMember[]) {
    const released = new Set(members);
    for (const member of members) {
      this.group.remove(member.group);
    }
    const retained = this.membersInternal.filter((member) => !released.has(member));
    this.membersInternal.splice(0, this.membersInternal.length, ...retained);
    this.rebuildFormation();
  }

  addMembers(members: readonly PartyMember[]) {
    this.membersInternal.push(...members);
    members.forEach((member) => this.group.add(member.group));
    this.rebuildFormation();
  }

  sortMembers(compare: (left: PartyMember, right: PartyMember) => number) {
    this.membersInternal.sort(compare);
    this.rebuildFormation();
  }

  private moveBy(direction: THREE.Vector3, amount: number) {
    this.position.addScaledVector(direction, amount);
    this.position.x = clamp(this.position.x, -WORLD_HALF_WIDTH, WORLD_HALF_WIDTH);
    this.position.z = clamp(this.position.z, -WORLD_HALF_HEIGHT, WORLD_HALF_HEIGHT);
  }

  private rebuildFormation() {
    this.formationSlots = buildFormationSlots(this.currentFormation, this.membersInternal);
  }

  private applyFormation(dt: number) {
    for (const member of this.membersInternal) {
      if (member.inCombat) {
        continue;
      }
      const slot = this.formationSlots.get(member.id) ?? new THREE.Vector3();
      const desiredLocal = slot.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
      member.update(dt, desiredLocal);
    }
  }
}
