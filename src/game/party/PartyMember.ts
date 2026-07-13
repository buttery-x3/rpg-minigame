import * as THREE from "three";
import { PARTY_MEMBER_SPEED } from "../../config";
import type { PartyRole } from "../../types";
import type { AbilityDefinition } from "../abilities/types";
import { materials } from "../../render/materials";

type PartyMemberConfig = {
  id: string;
  displayName: string;
  role: PartyRole;
  ability: AbilityDefinition;
};

export class PartyMember {
  readonly group = new THREE.Group();
  readonly position = this.group.position;
  readonly worldPosition = new THREE.Vector3();
  readonly maxHealth = 100;
  readonly abilities: readonly AbilityDefinition[];
  health = 100;

  constructor(private readonly config: PartyMemberConfig) {
    this.group.name = config.id;
    this.abilities = [config.ability];
    this.buildMesh();
  }

  get id() {
    return this.config.id;
  }

  get displayName() {
    return this.config.displayName;
  }

  get role() {
    return this.config.role;
  }

  update(dt: number, desiredLocalPosition: THREE.Vector3) {
    const delta = desiredLocalPosition.clone().sub(this.position);
    const distance = delta.length();
    if (distance > 0.001) {
      this.position.addScaledVector(delta.normalize(), Math.min(distance, PARTY_MEMBER_SPEED * dt));
    }
  }

  refreshWorldPosition() {
    this.group.getWorldPosition(this.worldPosition);
  }

  private buildMesh() {
    const roleMaterial = {
      tank: materials.tankBody,
      melee: materials.meleeBody,
      ranged: materials.rangedBody,
      healer: materials.healerBody,
    }[this.role];

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 5, 10), roleMaterial);
    body.position.y = 0.72;
    body.castShadow = true;
    this.group.add(body);

    const roleMarker = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, 0.16, 8), roleMaterial);
    roleMarker.position.y = 1.25;
    roleMarker.castShadow = true;
    this.group.add(roleMarker);

    const base = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 18), materials.partyBase);
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.05;
    this.group.add(base);
  }
}
