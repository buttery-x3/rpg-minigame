import * as THREE from "three";
import { WORLD_HALF_HEIGHT, WORLD_HALF_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from "../../config";
import { materials } from "../../render/materials";

const TILE_SIZE = 4;
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
    const checkerMaterial = new THREE.MeshStandardMaterial({ map: this.createCheckerTexture(), roughness: 0.96, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT), checkerMaterial);
    ground.name = "CheckerTestPlane";
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  private createCheckerTexture() {
    const light = [104, 116, 122, 255];
    const dark = [60, 70, 78, 255];
    const texture = new THREE.DataTexture(new Uint8Array([...light, ...dark, ...dark, ...light]), 2, 2, THREE.RGBAFormat);
    texture.name = "TestWorldChecker";
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.repeat.set(WORLD_WIDTH / TILE_SIZE / 2, WORLD_HEIGHT / TILE_SIZE / 2);
    texture.needsUpdate = true;
    return texture;
  }

  private buildGrid() {
    const positions: number[] = [];
    for (let x = -WORLD_HALF_WIDTH; x <= WORLD_HALF_WIDTH; x += TILE_SIZE) positions.push(x, 0.015, -WORLD_HALF_HEIGHT, x, 0.015, WORLD_HALF_HEIGHT);
    for (let z = -WORLD_HALF_HEIGHT; z <= WORLD_HALF_HEIGHT; z += TILE_SIZE) positions.push(-WORLD_HALF_WIDTH, 0.015, z, WORLD_HALF_WIDTH, 0.015, z);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const grid = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x9ba7ad, transparent: true, opacity: 0.55 }));
    grid.name = "TestWorldGrid";
    this.group.add(grid);
  }

  private buildBorder() {
    const horizontalGeometry = new THREE.BoxGeometry(WORLD_WIDTH + BORDER_WIDTH, BORDER_HEIGHT, BORDER_WIDTH);
    const verticalGeometry = new THREE.BoxGeometry(BORDER_WIDTH, BORDER_HEIGHT, WORLD_HEIGHT + BORDER_WIDTH);
    for (const z of [-WORLD_HALF_HEIGHT, WORLD_HALF_HEIGHT]) this.addBorderRail(horizontalGeometry, 0, z);
    for (const x of [-WORLD_HALF_WIDTH, WORLD_HALF_WIDTH]) this.addBorderRail(verticalGeometry, x, 0);
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
