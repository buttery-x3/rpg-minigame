import * as THREE from "three";
import type { CombatEvent, Vec2 } from "./types";

type ActiveEffect = {
  object: THREE.Object3D;
  remaining: number;
  duration: number;
  key?: string;
  from?: THREE.Vector3;
  to?: THREE.Vector3;
  update?: (progress: number, dt: number) => void;
};

export class CombatEffectsRenderer {
  readonly group = new THREE.Group();
  private readonly effects: ActiveEffect[] = [];
  private createdCount = 0;

  constructor() {
    this.group.name = "CombatEffects";
  }

  get activeCount() {
    return this.effects.length;
  }

  get totalCreated() {
    return this.createdCount;
  }

  consume(events: CombatEvent[]) {
    events.forEach((event) => this.addEvent(event));
  }

  update(dt: number) {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.remaining -= dt;
      const progress = 1 - Math.max(0, effect.remaining) / effect.duration;
      if (effect.from && effect.to) effect.object.position.lerpVectors(effect.from, effect.to, progress);
      effect.update?.(progress, dt);
      this.setOpacity(effect.object, Math.min(1, effect.remaining / Math.min(effect.duration, 0.24)));
      if (effect.remaining > 0) continue;
      this.destroyEffect(index);
    }
  }

  dispose() {
    while (this.effects.length > 0) this.destroyEffect(this.effects.length - 1);
  }

  private addEvent(event: CombatEvent) {
    if (event.type === "cast-started") {
      this.addCastCue(event.sourcePosition, event.abilityId, event.duration);
    } else if (event.type === "auto-attack" && event.kind === "sword") {
      this.addSwordSlash(event.sourcePosition, event.targetPosition, event.duration);
    } else if (event.type === "projectile-launched") {
      this.addProjectile(event);
    } else if (event.type === "ability-impact") {
      this.addAbilityImpact(event.abilityId, event.position, event.radius);
    } else if (event.type === "channel-started") {
      this.addHealingCircle(event.sourceId, event.position, event.radius);
    } else if (event.type === "channel-tick") {
      this.addHealingPulse(event.position, event.radius);
    } else if (event.type === "channel-ended") {
      this.endKey(`circle:${event.sourceId}`);
    } else if (event.type === "teleport") {
      this.addTeleport(event.from, event.to);
    } else if (event.type === "taunt") {
      this.addTaunt(event.sourcePosition, event.targetPosition, event.duration);
    } else if (event.type === "heal") {
      this.addHeal(event.sourcePosition, event.targetPosition);
    } else if (event.type === "damage") {
      this.addParticles(this.vector(event.targetPosition, 0.8), event.abilityId === "ranged-fireball" ? 0xff8a43 : 0xf1d4a0, 7, 0.28, 1.35);
    } else if (event.type === "action-interrupted") {
      this.addRing(this.vector(event.position), 0.75, 0xf05d6c, 0.28, true);
    } else if (event.type === "death") {
      this.addParticles(this.vector(event.position, 0.5), 0x5d6670, 18, 0.8, 1.2);
    }
  }

  private addCastCue(position: Vec2, abilityId: string, duration: number) {
    const colors: Record<string, number> = {
      "tank-threat-shout": 0x65c9ff,
      "tank-taunt": 0xff5f66,
      "melee-fan-of-knives": 0xe8edf3,
      "melee-backstab": 0xe9c96c,
      "ranged-fireball": 0xff8a43,
      "ranged-meteor": 0xffb24d,
      "healer-heal": 0xffe7a8,
      "healer-healing-circle": 0xffdda0,
    };
    this.addRing(this.vector(position), 0.72, colors[abilityId] ?? 0xffffff, Math.max(0.18, duration), true);
  }

  private addAbilityImpact(abilityId: string, position: Vec2, radius: number) {
    const point = this.vector(position);
    if (abilityId === "tank-threat-shout") {
      this.addRing(point, radius, 0x67ceff, 0.65, true);
      this.addParticles(this.vector(position, 0.4), 0xa7e5ff, 28, 0.7, 1.4);
    } else if (abilityId === "melee-fan-of-knives") {
      this.addKnifeFan(position, radius);
    } else if (abilityId === "melee-backstab") {
      this.addSwordSlash(position, position, 0.24, 0xf7d971);
    } else if (abilityId === "ranged-meteor") {
      this.addRing(point, radius, 0xff7b35, 0.8, true);
      this.addParticles(this.vector(position, 0.2), 0xffb65c, 58, 1.1, 2.2);
    }
  }

  private addSwordSlash(source: Vec2, target: Vec2, duration: number, color = 0xffe4ad) {
    const slash = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.065, 6, 28, Math.PI * 1.25),
      this.effectMaterial(color, 0.86),
    );
    slash.position.copy(this.vector(target, 0.8));
    slash.rotation.set(Math.PI / 2.5, Math.atan2(target.x - source.x, target.z - source.z), -0.7);
    this.add(slash, Math.max(0.18, duration), undefined, undefined, (progress) => slash.scale.setScalar(0.65 + progress * 0.7));
  }

  private addProjectile(event: Extract<CombatEvent, { type: "projectile-launched" }>) {
    const targetHeight = event.kind === "meteor" ? 0.25 : 0.9;
    const from = event.kind === "meteor" ? this.vector(event.targetPosition, 10) : this.vector(event.sourcePosition, 1.15);
    const to = this.vector(event.targetPosition, targetHeight);
    const projectile = new THREE.Group();
    const color = event.kind === "wand" ? 0xc6e6ff : event.kind === "meteor" ? 0xff6b2f : 0xff8a43;
    const size = event.kind === "meteor" ? 0.72 : event.kind === "fireball" ? 0.22 : 0.11;
    const coreGeometry = event.kind === "meteor" ? new THREE.IcosahedronGeometry(size, 1) : new THREE.SphereGeometry(size, 12, 10);
    const core = new THREE.Mesh(coreGeometry, this.effectMaterial(color, 0.98));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(size * 1.9, 12, 10), this.effectMaterial(color, 0.25));
    projectile.add(core, glow);
    if (event.kind === "meteor") {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(size * 0.82, size * 3.4, 10, 1, true), this.effectMaterial(0xffa33f, 0.34));
      flame.position.y = size * 1.75;
      projectile.add(flame);
    }
    projectile.position.copy(from);
    const trailTimer = { value: 0 };
    this.add(projectile, event.duration, from, to, (_progress, dt) => {
      trailTimer.value -= dt;
      if (trailTimer.value <= 0) {
        trailTimer.value += event.kind === "meteor" ? 0.045 : 0.07;
        this.addParticles(projectile.position.clone(), color, event.kind === "meteor" ? 3 : 1, 0.3, 0.35);
      }
    });
  }

  private addKnifeFan(position: Vec2, radius: number) {
    const knives = new THREE.Group();
    knives.position.copy(this.vector(position, 0.45));
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2;
      const knife = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 4), this.effectMaterial(0xe9f1fa, 0.9));
      knife.rotation.z = Math.PI / 2;
      knife.rotation.y = -angle;
      knife.userData.direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      knives.add(knife);
    }
    this.add(knives, 0.42, undefined, undefined, (progress) => {
      knives.children.forEach((knife) => knife.position.copy(knife.userData.direction).multiplyScalar(radius * progress));
    });
  }

  private addHealingCircle(sourceId: string, position: Vec2, radius: number) {
    const root = new THREE.Group();
    root.position.copy(this.vector(position, 0.045));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.92, 64), this.softDiscMaterial(0xffe2a3, 0.2));
    disc.rotation.x = -Math.PI / 2;
    root.add(disc);
    for (let index = 0; index < 6; index += 1) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(radius * (index % 2 === 0 ? 0.72 : 0.5), 0.025, 4, 18, Math.PI * 0.34),
        this.effectMaterial(index % 2 === 0 ? 0xffdfa0 : 0xdaf4ff, 0.42),
      );
      arc.rotation.x = -Math.PI / 2;
      arc.rotation.z = index / 6 * Math.PI * 2;
      root.add(arc);
    }
    const moteCount = 18;
    const motePositions = new Float32Array(moteCount * 3);
    for (let index = 0; index < moteCount; index += 1) {
      const angle = index / moteCount * Math.PI * 2;
      const moteRadius = radius * (0.18 + index % 5 / 7);
      motePositions[index * 3] = Math.cos(angle) * moteRadius;
      motePositions[index * 3 + 1] = index % 4 * 0.32;
      motePositions[index * 3 + 2] = Math.sin(angle) * moteRadius;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
    const motes = new THREE.Points(moteGeometry, new THREE.PointsMaterial({ color: 0xffefc4, size: 0.11, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false }));
    root.add(motes);
    this.add(root, 5.25, undefined, undefined, (progress, dt) => {
      root.rotation.y += dt * 0.16;
      disc.scale.setScalar(0.98 + Math.sin(progress * Math.PI * 10) * 0.015);
      const attribute = moteGeometry.getAttribute("position") as THREE.BufferAttribute;
      for (let index = 0; index < moteCount; index += 1) attribute.setY(index, (attribute.getY(index) + dt * 0.55) % 1.6);
      attribute.needsUpdate = true;
    }, `circle:${sourceId}`);
  }

  private addHealingPulse(position: Vec2, radius: number) {
    const pulse = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.88, 48), this.softDiscMaterial(0xfff0be, 0.28));
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.copy(this.vector(position, 0.065));
    pulse.scale.setScalar(0.25);
    this.add(pulse, 0.55, undefined, undefined, (progress) => pulse.scale.setScalar(0.25 + progress * 0.9));
    this.addParticles(this.vector(position, 0.22), 0xffe9ad, 18, 0.75, 0.72);
    this.addParticles(this.vector(position, 0.18), 0xd9f3ff, 8, 0.6, 0.48);
  }

  private addTeleport(from: Vec2, to: Vec2) {
    const geometry = new THREE.BufferGeometry().setFromPoints([this.vector(from, 0.9), this.vector(to, 0.9)]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xf6d66e, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.add(line, 0.28);
    this.addParticles(this.vector(from, 0.6), 0xf6d66e, 16, 0.38, 1.25);
    this.addParticles(this.vector(to, 0.6), 0xffefad, 18, 0.38, 1.25);
  }

  private addTaunt(source: Vec2, target: Vec2, duration: number) {
    const geometry = new THREE.BufferGeometry().setFromPoints([this.vector(source, 1), this.vector(target, 1)]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff5c66, transparent: true, opacity: 0.72, depthWrite: false }));
    this.add(line, 0.5);
    this.addRing(this.vector(target), 1.05, 0xff4c57, duration, false, (progress, object) => {
      object.scale.setScalar(0.92 + Math.sin(progress * Math.PI * 20) * 0.08);
    });
  }

  private addHeal(source: Vec2, target: Vec2) {
    const from = this.vector(source, 1.05);
    const to = this.vector(target, 1.05);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), this.effectMaterial(0xffe6a3, 0.92));
    orb.position.copy(from);
    this.add(orb, 0.35, from, to);
    this.addParticles(to, 0xffefc4, 12, 0.65, 0.7);
    this.addParticles(to, 0xd8f4ff, 6, 0.55, 0.48);
  }

  private addRing(
    position: THREE.Vector3,
    radius: number,
    color: number,
    duration: number,
    expand: boolean,
    update?: (progress: number, object: THREE.Object3D) => void,
  ) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 48), this.effectMaterial(color, 0.72));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    if (expand) ring.scale.setScalar(0.25);
    this.add(ring, duration, undefined, undefined, (progress) => {
      if (expand) ring.scale.setScalar(0.25 + progress * 0.9);
      update?.(progress, ring);
    });
  }

  private addParticles(position: THREE.Vector3, color: number, count: number, duration: number, speed: number) {
    const positions = new Float32Array(count * 3);
    const velocities = Array.from({ length: count }, (_, index) => {
      const angle = index / Math.max(1, count) * Math.PI * 2 + Math.random() * 0.35;
      return new THREE.Vector3(Math.cos(angle) * (0.25 + Math.random()) * speed, (0.4 + Math.random() * 1.3) * speed, Math.sin(angle) * (0.25 + Math.random()) * speed);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.14, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    particles.position.copy(position);
    this.add(particles, duration, undefined, undefined, (_progress, dt) => {
      const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
      velocities.forEach((velocity, index) => {
        velocity.y -= 1.8 * dt;
        attribute.setXYZ(index, attribute.getX(index) + velocity.x * dt, attribute.getY(index) + velocity.y * dt, attribute.getZ(index) + velocity.z * dt);
      });
      attribute.needsUpdate = true;
    });
  }

  private effectMaterial(color: number, opacity: number) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  }

  private softDiscMaterial(color: number, opacity: number) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec2 centered = (vUv - 0.5) * 2.0;
          float radius = length(centered);
          float angle = atan(centered.y, centered.x);
          float glow = (1.0 - smoothstep(0.08, 1.0, radius)) * 0.42;
          float edge = smoothstep(0.68, 0.82, radius) * (1.0 - smoothstep(0.86, 1.0, radius));
          float broken = smoothstep(0.15, 0.75, sin(angle * 12.0 + radius * 8.0) * 0.5 + 0.5);
          float alpha = (glow + edge * broken * 0.7) * uOpacity;
          if (radius > 1.0 || alpha < 0.004) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }

  private add(object: THREE.Object3D, duration: number, from?: THREE.Vector3, to?: THREE.Vector3, update?: (progress: number, dt: number) => void, key?: string) {
    this.group.add(object);
    this.createdCount += 1;
    this.effects.push({ object, remaining: duration, duration, from, to, update, key });
  }

  private endKey(key: string) {
    const effect = this.effects.find((candidate) => candidate.key === key);
    if (effect) effect.remaining = Math.min(effect.remaining, 0.2);
  }

  private destroyEffect(index: number) {
    const [effect] = this.effects.splice(index, 1);
    this.group.remove(effect.object);
    effect.object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line)) return;
      child.geometry.dispose();
      const dispose = (material: THREE.Material) => material.dispose();
      Array.isArray(child.material) ? child.material.forEach(dispose) : dispose(child.material);
    });
  }

  private setOpacity(object: THREE.Object3D, multiplier: number) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line)) return;
      const set = (material: THREE.Material) => {
        if (material instanceof THREE.ShaderMaterial && material.uniforms.uOpacity) {
          const base = material.userData.effectBaseOpacity ?? material.uniforms.uOpacity.value;
          material.userData.effectBaseOpacity = base;
          material.uniforms.uOpacity.value = base * multiplier;
          return;
        }
        if (!("opacity" in material)) return;
        const base = material.userData.effectBaseOpacity ?? material.opacity;
        material.userData.effectBaseOpacity = base;
        material.transparent = true;
        material.opacity = base * multiplier;
      };
      Array.isArray(child.material) ? child.material.forEach(set) : set(child.material);
    });
  }

  private vector(position: Vec2, y = 0.15) {
    return new THREE.Vector3(position.x, y, position.z);
  }
}
