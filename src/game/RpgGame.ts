import * as THREE from "three";
import { WORLD_BOUNDS } from "../config";
import { vecToTuple } from "../lib/math";
import { materials } from "../render/materials";
import type { RpgDiagnostics } from "../types";
import { CameraRig } from "./camera/CameraRig";
import { GameInput } from "./input/GameInput";
import { PlayerController } from "./player/PlayerController";
import { WorldScene } from "./world/WorldScene";
import { Hud } from "../ui/Hud";

export class RpgGame {
  private readonly container: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 250);
  private readonly clock = new THREE.Clock();
  private readonly world = new WorldScene();
  private readonly player = new PlayerController();
  private readonly targetMarker = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 24), materials.marker);
  private readonly cameraRig: CameraRig;
  private readonly input: GameInput;
  private readonly hud: Hud;

  private animationFrame = 0;
  private frameCount = 0;
  private paused = false;

  constructor() {
    const container = document.querySelector<HTMLElement>("#game");
    if (!container) {
      throw new Error("Missing #game container");
    }

    this.container = container;
    this.cameraRig = new CameraRig(this.camera, this.renderer);
    this.input = new GameInput(this.camera, this.renderer, {
      isPaused: () => this.paused,
      setMoveTarget: (target) => this.setMoveTarget(target),
      togglePaused: () => this.togglePaused(),
    });
    this.hud = new Hud(this.player);

    this.configureRenderer();
    this.buildScene();
    this.container.append(this.renderer.domElement, this.hud.element);

    window.addEventListener("resize", this.cameraRig.resize);
    this.cameraRig.resize();
    this.hud.update(this.paused);
    this.animationFrame = window.requestAnimationFrame(this.tick);
  }

  getDiagnostics(): RpgDiagnostics {
    return {
      frameCount: this.frameCount,
      paused: this.paused,
      player: {
        position: vecToTuple(this.player.position),
        target: vecToTuple(this.player.target),
        moving: this.player.isMoving(),
        health: this.player.health,
        stamina: this.player.stamina,
      },
      camera: {
        position: vecToTuple(this.camera.position),
      },
      input: {
        pointerWorld: vecToTuple(this.input.pointerWorld),
        holdingMove: this.input.holdingMove,
      },
      world: {
        propCount: this.world.propCount,
        bounds: WORLD_BOUNDS,
      },
    };
  }

  dispose() {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.cameraRig.resize);
    this.input.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private configureRenderer() {
    this.renderer.setClearColor(0x182028);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  private buildScene() {
    this.scene.background = new THREE.Color(0x182028);
    this.scene.fog = new THREE.Fog(0x182028, 46, 94);

    const hemisphere = new THREE.HemisphereLight(0xe8f0da, 0x253144, 2.3);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffe8b8, 3.2);
    sun.position.set(-18, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 42;
    sun.shadow.camera.bottom = -42;
    this.scene.add(sun);

    this.targetMarker.rotation.x = -Math.PI / 2;
    this.targetMarker.position.y = 0.09;
    this.targetMarker.visible = false;

    this.scene.add(this.world.group, this.player.group, this.targetMarker);
  }

  private readonly tick = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.animationFrame = window.requestAnimationFrame(this.tick);

    if (!this.paused) {
      this.input.update(dt);
      if (this.input.consumeMoveRequest()) {
        this.setMoveTarget(this.input.pointerWorld);
      }
      this.player.update(dt);
    }

    this.targetMarker.position.x = this.player.target.x;
    this.targetMarker.position.z = this.player.target.z;
    this.targetMarker.visible = this.player.isMoving();
    this.targetMarker.rotation.z += dt * 1.8;

    this.cameraRig.update(dt, this.player.position);
    this.hud.update(this.paused);
    this.renderer.render(this.scene, this.camera);
    this.frameCount += 1;
  };

  private setMoveTarget(target: THREE.Vector3) {
    this.player.setMoveTarget(target);
  }

  private togglePaused() {
    this.paused = !this.paused;
  }
}
