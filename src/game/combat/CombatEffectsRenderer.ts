import * as THREE from "three";
import type { CombatSimulation } from "./CombatSimulation";
import type { CombatEvent, Vec2 } from "./types";

type ActiveEffect = { object: THREE.Object3D; remaining: number; duration: number; from?: THREE.Vector3; to?: THREE.Vector3; update?: (progress: number, dt: number) => void };

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
      effect.update?.(progress, dt);
      this.setOpacity(effect.object, Math.min(1, effect.remaining / Math.min(effect.duration, 0.28)));
      if (effect.remaining > 0) continue;
      this.group.remove(effect.object);
      effect.object.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
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
    if (event.type === "damage") { const position = this.positionOf(event.targetId); this.addRing(position, 0.55, 0xd56856, 0.25); this.addParticles(position, 0xd56856, 12, 0.32); }
    if (event.type === "heal") { const position = this.positionOf(event.targetId); this.addRing(position, 0.6, 0x71c991, 0.35); this.addParticles(position, 0x77eeb0, 14, 0.45); }
  }

  private addCast(event: Extract<CombatEvent, { type: "cast" }>) {
    const source = this.positionOf(event.sourceId);
    const target = this.vector(event.position);
    if (event.abilityId === "ranged-fireball") {
      this.addProjectile(source, target, 0xff8a43, 0.35); return;
    }
    if (event.abilityId === "ranged-meteor") { this.addRing(target, 4, 0xffa84d, 0.8); this.addParticles(target, 0xffb65c, 40, 0.8); return; }
    if (event.abilityId === "healer-healing-circle") { this.addRing(target, 4, 0x67d69a, 5); this.addParticles(target, 0x8cffc0, 26, 1.2); return; }
    if (event.abilityId === "melee-fan-of-knives") { this.addRing(source, 3, 0xf0c75e, 0.35); this.addParticles(source, 0xffdf7c, 18, 0.38); return; }
    if (event.abilityId === "tank-threat-shout") { this.addRing(source, 3.5, 0x79b5dd, 0.5); this.addParticles(source, 0x8bd2ff, 20, 0.5); return; }
    if (event.abilityId === "melee-backstab") this.addRing(target, 1, 0xf2d479, 0.3);
  }

  private addRing(position: THREE.Vector3, radius: number, color: number, duration: number) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.72, radius, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.76, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(position); ring.position.y = 0.08; this.add(ring, duration);
  }

  private addProjectile(from: THREE.Vector3, to: THREE.Vector3, color: number, duration: number) {
    const projectile = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    projectile.add(core, glow); projectile.position.copy(from);
    this.add(projectile, duration, from, to);
  }

  private addParticles(position: THREE.Vector3, color: number, count: number, duration: number) {
    const positions = new Float32Array(count * 3);
    const velocities = Array.from({ length: count }, () => new THREE.Vector3((Math.random() - 0.5) * 2.2, Math.random() * 1.8 + 0.25, (Math.random() - 0.5) * 2.2));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color, size: 0.13, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const particles = new THREE.Points(geometry, material);
    particles.position.copy(position);
    this.add(particles, duration, undefined, undefined, (_progress, dt) => {
      const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
      velocities.forEach((velocity, index) => {
        velocity.y -= 2.2 * dt;
        attribute.setXYZ(index, attribute.getX(index) + velocity.x * dt, attribute.getY(index) + velocity.y * dt, attribute.getZ(index) + velocity.z * dt);
      });
      attribute.needsUpdate = true;
    });
  }

  private add(object: THREE.Object3D, duration: number, from?: THREE.Vector3, to?: THREE.Vector3, update?: (progress: number, dt: number) => void) { this.group.add(object); this.effects.push({ object, remaining: duration, duration, from, to, update }); }
  private setOpacity(object: THREE.Object3D, multiplier: number) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Points)) return;
      const set = (material: THREE.Material) => {
        if (!("opacity" in material)) return;
        const base = material.userData.effectBaseOpacity ?? material.opacity;
        material.userData.effectBaseOpacity = base;
        material.transparent = true;
        material.opacity = base * multiplier;
      };
      Array.isArray(child.material) ? child.material.forEach(set) : set(child.material);
    });
  }
  private positionOf(unitId: string) { return this.vector(this.simulation.units.get(unitId)?.position ?? { x: 0, z: 0 }); }
  private vector(position: Vec2) { return new THREE.Vector3(position.x, 0.15, position.z); }
}
