import * as THREE from "three";
import { CAMERA_FOV, WORLD_HEIGHT, WORLD_WIDTH } from "../config";
import { vecToTuple } from "../lib/math";
import { materials } from "../render/materials";
import type { RpgDiagnostics } from "../types";
import { CameraRig } from "./camera/CameraRig";
import { CombatEffectsRenderer } from "./combat/CombatEffectsRenderer";
import { GameInput } from "./input/GameInput";
import { PartyController } from "./party/PartyController";
import { WorldScene } from "./world/WorldScene";
import { Hud } from "../ui/Hud";

export class RpgGame {
  private readonly container: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 250);
  private readonly clock = new THREE.Clock();
  private readonly world = new WorldScene();
  private readonly party = new PartyController();
  private readonly combatEffects = new CombatEffectsRenderer();
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
      setGesturePreview: (preview) => this.hud.setGesturePreview(preview),
      togglePaused: () => this.togglePaused(),
    });
    this.hud = new Hud(this.party, {
      setFormation: (groupId, formation) => this.party.setFormation(groupId, formation),
      returnGroup: (groupId) => this.party.returnGroup(groupId),
      setStance: (groupId, stance) => this.party.setStance(groupId, stance),
      recallGroup: (groupId) => this.party.recallGroup(groupId),
      setCameraAngle: (angle) => this.cameraRig.setVerticalAngle(angle),
      setCameraHeight: (height) => this.cameraRig.setHeight(height),
      setCameraFov: (fov) => this.cameraRig.setFov(fov),
    });

    this.configureRenderer();
    this.buildScene();
    void this.party.loadVisualAssets();
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
      combat: {
        activeEffects: this.combatEffects.activeCount,
        effectsCreated: this.combatEffects.totalCreated,
        loadedModels: this.party.loadedModelCount,
        totalModels: this.party.members.length + this.party.enemies.length,
        aliveEnemies: this.party.enemies.filter((member) => member.alive).length,
      },
      party: {
        position: vecToTuple(this.party.position),
        moving: this.party.isMoving(),
        formation: this.party.formation,
        heading: this.party.headingAngle,
        memberCount: this.party.members.length,
        groups: this.party.groups.map((group) => ({
          id: group.id,
          isMain: group.isMain,
          position: vecToTuple(group.position),
          formation: group.formation,
          stance: this.party.getGroupStance(group.id),
          memberIds: group.members.map((member) => member.id),
        })),
        members: this.party.members.map((member) => {
          const combatMember = this.party.combat.units.get(member.id);
          return {
            id: member.id,
            role: member.role,
            position: vecToTuple(member.worldPosition),
            health: member.health,
            maxHealth: member.maxHealth,
            energy: member.energy,
            maxEnergy: member.maxEnergy,
            threat: member.threat,
            action: member.action,
            stats: combatMember?.stats ?? { stamina: 0, strength: 0, agility: 0, intelligence: 0, wisdom: 0, awareness: 0 },
            abilities: (combatMember?.abilities ?? []).map((id) => ({ id, cooldownRemaining: combatMember?.cooldowns[id] ?? 0 })),
          };
        }),
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
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
      },
    };
  }

  dispose() {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.cameraRig.resize);
    this.input.dispose();
    this.combatEffects.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private configureRenderer() {
    this.renderer.setClearColor(0x182028);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  private buildScene() {
    this.scene.background = new THREE.Color(0x182028);
    this.scene.fog = new THREE.Fog(0x182028, 46, 94);

    const hemisphere = new THREE.HemisphereLight(0xe8f0da, 0x253144, 1.65);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffe8b8, 2.6);
    sun.position.set(-18, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 42;
    sun.shadow.camera.bottom = -42;
    this.scene.add(sun);

    this.scene.add(this.world.group, this.party.group, this.combatEffects.group);
  }

  private readonly tick = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.animationFrame = window.requestAnimationFrame(this.tick);

    if (!this.paused) {
      this.input.update();
      this.party.update(dt);
      this.combatEffects.consume(this.party.combat.consumeEvents());
      this.combatEffects.update(dt);
    }

    this.cameraRig.update(dt, this.party.cameraFocus);
    this.hud.update(this.paused);
    this.renderer.render(this.scene, this.camera);
    this.frameCount += 1;
  };

  private togglePaused() {
    this.paused = !this.paused;
  }
}
