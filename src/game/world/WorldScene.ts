import * as THREE from "three";
import { WORLD_BOUNDS } from "../../config";
import { materials } from "../../render/materials";

export class WorldScene {
  readonly group = new THREE.Group();
  propCount = 0;

  constructor() {
    this.group.name = "World";
    this.buildGround();
    this.buildPath();
    this.buildWater();
    this.buildTrees();
    this.buildRuins();
  }

  private buildGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_BOUNDS * 2.4, WORLD_BOUNDS * 2.4, 18, 18), materials.grass);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    const rim = new THREE.Mesh(new THREE.RingGeometry(WORLD_BOUNDS * 0.96, WORLD_BOUNDS * 1.02, 64), materials.grassDark);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.02;
    this.group.add(rim);
  }

  private buildPath() {
    const pathGeometry = new THREE.BoxGeometry(8.5, 0.05, 46);
    const path = new THREE.Mesh(pathGeometry, materials.stone);
    path.position.set(-2, 0.03, 0);
    path.rotation.y = -0.22;
    path.receiveShadow = true;
    this.group.add(path);

    for (let i = -5; i <= 5; i += 1) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.88, 0.14, 7), materials.stoneDark);
      stone.position.set(7 + Math.sin(i) * 1.8, 0.08, i * 3.8);
      stone.rotation.y = i * 0.7;
      stone.castShadow = true;
      stone.receiveShadow = true;
      this.group.add(stone);
      this.propCount += 1;
    }
  }

  private buildWater() {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(5.2, 40), materials.water);
    pond.rotation.x = -Math.PI / 2;
    pond.scale.set(1.35, 0.72, 1);
    pond.position.set(-13, 0.06, -9);
    this.group.add(pond);
  }

  private buildTrees() {
    const treePositions = [
      [-17, -17],
      [-20, 7],
      [-12, 17],
      [13, -18],
      [19, -5],
      [17, 14],
      [4, 21],
      [-24, -2],
    ];

    for (const [x, z] of treePositions) {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.36, 1.8, 7), materials.bark);
      trunk.position.y = 0.9;
      trunk.castShadow = true;
      tree.add(trunk);

      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.18, 2.6, 8), materials.leaves);
      leaves.position.y = 2.45;
      leaves.castShadow = true;
      tree.add(leaves);

      this.group.add(tree);
      this.propCount += 1;
    }
  }

  private buildRuins() {
    const arch = new THREE.Group();
    arch.position.set(10, 0, 9);

    for (const x of [-1.35, 1.35]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.2, 0.8), materials.stoneDark);
      pillar.position.set(x, 1.6, 0);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      arch.add(pillar);
    }

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.7, 0.85), materials.stone);
    lintel.position.set(0, 3.35, 0);
    lintel.castShadow = true;
    lintel.receiveShadow = true;
    arch.add(lintel);

    const sigil = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 0), materials.marker);
    sigil.position.set(0, 2.05, -0.28);
    arch.add(sigil);

    this.group.add(arch);
    this.propCount += 4;
  }
}

