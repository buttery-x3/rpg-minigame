import * as THREE from "three";
import { WORLD_BOUNDS } from "../config";
import { vecToTuple } from "../lib/math";
import { materials } from "../render/materials";
import type { RpgDiagnostics } from "../types";
import { CameraRig } from "./camera/CameraRig";
import { GameInput } from "./input/GameInput";
import { PartyController } from "./party/PartyController";
import { WorldScene } from "./world/WorldScene";
import { Hud } from "../ui/Hud";

export class RpgGame {
  private readonly container: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 250);
  private readonly clock = new THREE.Clock();
  private readonly world = new WorldScene();
  private readonly party = new PartyController();
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
      setMoveInput: (input) => this.party.setMoveInput(input),
      issueRoleCommand: (role, command, target) => this.party.issueRoleCommand(role, command, target),
      useRoleAbility: (role) => this.party.useRoleAbility(role),
      setGesturePreview: (preview) => this.hud.setGesturePreview(preview),
      togglePaused: () => this.togglePaused(),
    });
    this.hud = new Hud(this.party, {
      setFormation: (formation) => this.party.setFormation(formation),
    });

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
      party: {
        position: vecToTuple(this.party.position),
        moving: this.party.isMoving(),
        formation: this.party.formation,
        heading: this.party.headingAngle,
        memberCount: this.party.members.length,
        members: this.party.members.map((member) => ({
          id: member.id,
          role: member.role,
          position: vecToTuple(member.worldPosition),
          health: member.health,
          maxHealth: member.maxHealth,
          ability: {
            id: member.abilities[0].id,
            cooldownRemaining: this.party.getAbilityCooldown(member),
          },
        })),
      },
      camera: {
        position: vecToTuple(this.camera.position),
      },
      input: {
        pointerWorld: vecToTuple(this.input.pointerWorld),
        moving: this.input.moving,
        gesture: this.input.gesture,
      },
      world: {
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

    this.scene.add(this.world.group, this.party.group);
  }

  private readonly tick = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.animationFrame = window.requestAnimationFrame(this.tick);

    if (!this.paused) {
      this.input.update();
      this.party.update(dt);
    }

    this.cameraRig.update(dt, this.party.position);
    this.hud.update(this.paused);
    this.renderer.render(this.scene, this.camera);
    this.frameCount += 1;
  };

  private togglePaused() {
    this.paused = !this.paused;
  }
}
