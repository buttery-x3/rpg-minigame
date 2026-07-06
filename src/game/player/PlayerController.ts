import * as THREE from "three";
import { PLAYER_SPEED, WORLD_BOUNDS } from "../../config";
import { clamp } from "../../lib/math";
import { materials } from "../../render/materials";

export class PlayerController {
  readonly group = new THREE.Group();
  readonly target = new THREE.Vector3();
  readonly position = this.group.position;

  health = 100;
  stamina = 84;

  private readonly facing = new THREE.Vector3(0, 0, 1);
  private moving = false;

  constructor() {
    this.group.name = "Player";
    this.target.copy(this.position);
    this.buildMesh();
  }

  setMoveTarget(target: THREE.Vector3) {
    this.target.set(clamp(target.x, -WORLD_BOUNDS, WORLD_BOUNDS), 0, clamp(target.z, -WORLD_BOUNDS, WORLD_BOUNDS));
  }

  update(dt: number) {
    const delta = this.target.clone().sub(this.position);
    delta.y = 0;
    const distance = delta.length();
    this.moving = distance > 0.08;

    if (this.moving) {
      const step = Math.min(distance, PLAYER_SPEED * dt);
      const direction = delta.normalize();
      this.position.addScaledVector(direction, step);
      this.facing.lerp(direction, 1 - Math.pow(0.0001, dt));
      this.group.rotation.y = Math.atan2(this.facing.x, this.facing.z);
      this.stamina = Math.max(0, this.stamina - dt * 2.2);
    } else {
      this.stamina = Math.min(100, this.stamina + dt * 5.5);
    }
  }

  isMoving() {
    return this.moving;
  }

  private buildMesh() {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.86, 5, 10), materials.playerBody);
    body.position.y = 0.88;
    body.castShadow = true;
    this.group.add(body);

    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.05, 5), materials.playerCloak);
    cloak.position.set(0, 0.62, -0.16);
    cloak.rotation.x = Math.PI;
    cloak.castShadow = true;
    this.group.add(cloak);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.34, 0.22), materials.stoneDark);
    pack.position.set(0, 0.92, -0.45);
    pack.castShadow = true;
    this.group.add(pack);
  }
}

