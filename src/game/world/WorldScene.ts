import * as THREE from "three";
import { WORLD_BOUNDS } from "../../config";
import { materials } from "../../render/materials";

const TILE_SIZE = 4;
const PLAYFIELD_SIZE = WORLD_BOUNDS * 2;
const GRID_DIVISIONS = PLAYFIELD_SIZE / TILE_SIZE;
const BORDER_WIDTH = 0.5;
const BORDER_HEIGHT = 0.35;

export class WorldScene {
  readonly group = new THREE.Group();

  constructor() {
    this.group.name = "TestWorld";
    this.buildTestPlane();
    this.buildGrid();
    this.buildBorder();
  }

  private buildTestPlane() {
    const checkerTexture = this.createCheckerTexture();
    const checkerMaterial = new THREE.MeshStandardMaterial({
      map: checkerTexture,
      roughness: 0.96,
      metalness: 0,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(PLAYFIELD_SIZE, PLAYFIELD_SIZE), checkerMaterial);

    ground.name = "CheckerTestPlane";
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  private createCheckerTexture() {
    const light = [104, 116, 122, 255];
    const dark = [60, 70, 78, 255];
    const pixels = new Uint8Array([...light, ...dark, ...dark, ...light]);
    const texture = new THREE.DataTexture(pixels, 2, 2, THREE.RGBAFormat);

    texture.name = "TestWorldChecker";
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.repeat.set(GRID_DIVISIONS / 2, GRID_DIVISIONS / 2);
    texture.needsUpdate = true;

    return texture;
  }

  private buildGrid() {
    const grid = new THREE.GridHelper(PLAYFIELD_SIZE, GRID_DIVISIONS, 0x9ba7ad, 0x9ba7ad);
    const gridMaterial = grid.material as THREE.LineBasicMaterial;

    grid.name = "TestWorldGrid";
    grid.position.y = 0.015;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.55;
    this.group.add(grid);
  }

  private buildBorder() {
    const horizontalGeometry = new THREE.BoxGeometry(
      PLAYFIELD_SIZE + BORDER_WIDTH,
      BORDER_HEIGHT,
      BORDER_WIDTH,
    );
    const verticalGeometry = new THREE.BoxGeometry(BORDER_WIDTH, BORDER_HEIGHT, PLAYFIELD_SIZE + BORDER_WIDTH);

    for (const z of [-WORLD_BOUNDS, WORLD_BOUNDS]) {
      this.addBorderRail(horizontalGeometry, 0, z);
    }

    for (const x of [-WORLD_BOUNDS, WORLD_BOUNDS]) {
      this.addBorderRail(verticalGeometry, x, 0);
    }
  }

  private addBorderRail(geometry: THREE.BufferGeometry, x: number, z: number) {
    const rail = new THREE.Mesh(geometry, materials.worldBorder);

    rail.name = "TestWorldBorder";
    rail.position.set(x, BORDER_HEIGHT / 2, z);
    rail.castShadow = true;
    rail.receiveShadow = true;
    this.group.add(rail);
  }
}
