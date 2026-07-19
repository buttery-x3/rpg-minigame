import * as THREE from "three";
import type { CombatSimulation } from "./CombatSimulation";
import type { CombatEvent, Vec2 } from "./types";

type ActiveEffect = { object: THREE.Object3D; remaining: number; duration: number; from?: THREE.Vector3; to?: THREE.Vector3 };

export class CombatEffectsRenderer {
  readonly group = new THREE.Group();
  private readonly effects: ActiveEffect[] = [];

  constructor(private readonly simulation: CombatSimulation) {
    this.group.name = "CombatEffects";
  }

  consume(events: CombatEvent[]) { events.forEach((event) => this.addEvent(event)); }

  update(dt: number) {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.remaining -= dt;
      const progress = 1 - Math.max(0, effect.remaining) / effect.duration;
      if (effect.from && effect.to) effect.object.position.lerpVectors(effect.from, effect.to, progress);
      if (effect.remaining > 0) continue;
      this.group.remove(effect.object);
      effect.object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
      this.effects.splice(index, 1);
    }
  }

  dispose() { this.effects.forEach((effect) => this.group.remove(effect.object)); this.effects.length = 0; }

  private addEvent(event: CombatEvent) {
    if (event.type === "cast") this.addCast(event);
    if (event.type === "taunt") this.addRing(this.positionOf(event.targetId), 1.1, 0xd86557, 0.7);
    if (event.type === "damage") this.addRing(this.positionOf(event.targetId), 0.55, 0xd56856, 0.25);
    if (event.type === "heal") this.addRing(this.positionOf(event.targetId), 0.6, 0x71c991, 0.3);
  }

  private addCast(event: Extract<CombatEvent, { type: "cast" }>) {
    const source = this.positionOf(event.sourceId);
    const target = this.vector(event.position);
    if (event.abilityId === "ranged-fireball") {
      const projectile = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8a43 }));
      projectile.position.copy(source); this.add(projectile, 0.35, source, target); return;
    }
    if (event.abilityId === "ranged-meteor") { this.addRing(target, 4, 0xffa84d, 0.8); return; }
    if (event.abilityId === "healer-healing-circle") { this.addRing(target, 4, 0x67d69a, 5); return; }
    if (event.abilityId === "melee-fan-of-knives") { this.addRing(source, 3, 0xf0c75e, 0.35); return; }
    if (event.abilityId === "tank-threat-shout") { this.addRing(source, 3.5, 0x79b5dd, 0.5); return; }
    if (event.abilityId === "melee-backstab") this.addRing(target, 1, 0xf2d479, 0.3);
  }

  private addRing(position: THREE.Vector3, radius: number, color: number, duration: number) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.72, radius, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(position); ring.position.y = 0.08; this.add(ring, duration);
  }

  private add(object: THREE.Object3D, duration: number, from?: THREE.Vector3, to?: THREE.Vector3) { this.group.add(object); this.effects.push({ object, remaining: duration, duration, from, to }); }
  private positionOf(unitId: string) { return this.vector(this.simulation.units.get(unitId)?.position ?? { x: 0, z: 0 }); }
  private vector(position: Vec2) { return new THREE.Vector3(position.x, 0.15, position.z); }
}
