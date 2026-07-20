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
  faction?: "party" | "enemy";
};

export class PartyMember {
  readonly group = new THREE.Group();
  readonly position = this.group.position;
  readonly worldPosition = new THREE.Vector3();
  maxHealth = 100;
  readonly abilities: readonly AbilityDefinition[];
  health = 100;
  energy = 100;
  maxEnergy = 100;
  threat = 0;
  action = "idle";
  inCombat = false;
  private readonly visualRoot = new THREE.Group();
  private readonly fallbackRoot = new THREE.Group();

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

  get faction() { return this.config.faction ?? "party"; }

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

  syncCombat(state: { health: number; maxHealth: number; energy: number; maxEnergy: number; threat: number; action: string; inCombat: boolean }) {
    this.health = state.health;
    this.maxHealth = state.maxHealth;
    this.energy = state.energy;
    this.maxEnergy = state.maxEnergy;
    this.threat = state.threat;
    this.action = state.action;
    this.inCombat = state.inCombat;
  }

  applyModel(template: THREE.Object3D) {
    this.visualRoot.clear();
    const model = template.clone(true);
    this.normalizeModel(model);
    this.makeOpaque(model);
    this.visualRoot.add(model);
    if (this.faction === "enemy") {
      const overlay = template.clone(true);
      this.normalizeModel(overlay);
      overlay.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.material = materials.enemyOverlay;
        child.renderOrder = 1;
      });
      overlay.scale.multiplyScalar(1.01);
      this.visualRoot.add(overlay);
    }
    this.fallbackRoot.visible = false;
  }

  private buildMesh() {
    const roleMaterial = ({
      tank: materials.tankBody,
      melee: materials.meleeBody,
      ranged: materials.rangedBody,
      healer: materials.healerBody,
    } as Record<string, THREE.MeshStandardMaterial>)[this.role] ?? materials.partyBase;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 5, 10), roleMaterial);
    body.position.y = 0.72;
    body.castShadow = true;
    this.fallbackRoot.add(body);

    const roleMarker = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, 0.16, 8), roleMaterial);
    roleMarker.position.y = 1.25;
    roleMarker.castShadow = true;
    this.fallbackRoot.add(roleMarker);

    const base = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.02, 28), this.faction === "enemy" ? materials.enemyUnitRing : materials.friendlyUnitRing);
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.05;
    this.group.add(base);
    this.group.add(this.visualRoot, this.fallbackRoot);
  }

  private normalizeModel(model: THREE.Object3D) {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 2.2 / Math.max(size.y, 0.01);
    model.scale.setScalar(scale);
    const scaledBounds = new THREE.Box3().setFromObject(model);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -scaledBounds.min.y, -center.z);
  }

  private makeOpaque(model: THREE.Object3D) {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = this.opaqueMaterial(child.material);
    });
  }

  private opaqueMaterial(material: THREE.Material | THREE.Material[]) {
    const makeOpaque = (source: THREE.Material) => {
      const opaque = source.clone();
      opaque.transparent = false;
      opaque.opacity = 1;
      opaque.depthWrite = true;
      if (opaque instanceof THREE.MeshStandardMaterial) {
        const tint = ({
          tank: materials.tankBody.color,
          melee: materials.meleeBody.color,
          ranged: materials.rangedBody.color,
          healer: materials.healerBody.color,
        } as Record<string, THREE.Color>)[this.role];
        if (tint) {
          opaque.color.lerp(tint, 0.32);
          opaque.emissive.copy(tint).multiplyScalar(0.13);
          opaque.emissiveIntensity = 1;
          opaque.roughness = Math.max(opaque.roughness, 0.68);
        }
      }
      return opaque;
    };
    return Array.isArray(material) ? material.map(makeOpaque) : makeOpaque(material);
  }
}
