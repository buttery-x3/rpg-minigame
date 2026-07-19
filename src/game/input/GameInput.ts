import * as THREE from "three";
import { WORLD_HALF_HEIGHT, WORLD_HALF_WIDTH } from "../../config";
import { clamp } from "../../lib/math";
import type { GestureIntent, GesturePreview, PartyCommand, PartyRole } from "../../types";

type InputCallbacks = {
  isPaused: () => boolean;
  setMoveInput: (input: THREE.Vector2) => void;
  issueRoleCommand: (role: PartyRole, command: PartyCommand, target: THREE.Vector3) => void;
  setGesturePreview: (preview: GesturePreview) => void;
  togglePaused: () => void;
};

const GESTURE_THRESHOLD = 34;
const GESTURE_DIRECTION_TOLERANCE = Math.PI / 6;

export class GameInput {
  readonly pointerWorld = new THREE.Vector3();

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly pointerClient = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly cameraRight = new THREE.Vector3();
  private readonly cameraUp = new THREE.Vector3();
  private readonly cameraRelativeMove = new THREE.Vector3();
  private readonly pressedKeys = new Set<string>();
  private pressedPointerId: number | null = null;
  private hasPointerClient = false;
  private gestureRole: PartyRole | null = null;
  private gestureIntent: GestureIntent | null = null;
  private gestureStart = new THREE.Vector2();
  private gestureTarget = new THREE.Vector3();
  private roleStart = new THREE.Vector2();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly callbacks: InputCallbacks,
  ) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerUp);
    window.addEventListener("contextmenu", this.preventContextMenu);
  }

  update() {
    this.refreshPointerWorld();
    const horizontalInput =
      (this.pressedKeys.has("d") ? 1 : 0) - (this.pressedKeys.has("a") ? 1 : 0);
    const verticalInput = (this.pressedKeys.has("w") ? 1 : 0) - (this.pressedKeys.has("s") ? 1 : 0);

    this.cameraRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.cameraRight.y = 0;
    this.cameraRight.normalize();
    this.cameraUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.cameraUp.y = 0;
    this.cameraUp.normalize();
    this.cameraRelativeMove
      .set(0, 0, 0)
      .addScaledVector(this.cameraRight, horizontalInput)
      .addScaledVector(this.cameraUp, verticalInput);

    const moveInput = new THREE.Vector2(this.cameraRelativeMove.x, this.cameraRelativeMove.z);
    this.callbacks.setMoveInput(this.callbacks.isPaused() ? new THREE.Vector2() : moveInput);
  }

  get moving() {
    return this.pressedKeys.has("w") || this.pressedKeys.has("a") || this.pressedKeys.has("s") || this.pressedKeys.has("d");
  }

  get gesture() {
    return {
      active: this.pressedPointerId !== null,
      role: this.gestureRole,
      intent: this.gestureIntent,
      screenX: this.gestureStart.x,
      screenY: this.gestureStart.y,
    } satisfies GesturePreview;
  }

  dispose() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener("contextmenu", this.preventContextMenu);
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) {
      this.pressedKeys.add(key);
      event.preventDefault();
      return;
    }

    if (!event.repeat && event.key === "Escape") {
      this.callbacks.togglePaused();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) {
      this.pressedKeys.delete(key);
      event.preventDefault();
    }
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.callbacks.isPaused() || this.isUiEvent(event)) {
      return;
    }

    this.updatePointerWorld(event);
    this.pressedPointerId = event.pointerId;
    this.gestureRole = null;
    this.gestureIntent = null;
    this.gestureStart.set(event.clientX, event.clientY);
    this.gestureTarget.copy(this.pointerWorld);
    this.roleStart.copy(this.gestureStart);
    this.emitGesturePreview();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.isUiEvent(event)) {
      return;
    }

    this.updatePointerWorld(event);
    if (event.pointerId !== this.pressedPointerId) {
      return;
    }

    this.updateGesture(event);
    this.emitGesturePreview();
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pressedPointerId) {
      return;
    }

    if (this.gestureRole && this.gestureIntent === "move") {
      this.callbacks.issueRoleCommand(this.gestureRole, "move", this.gestureTarget.clone());
    }

    this.pressedPointerId = null;
    this.gestureRole = null;
    this.gestureIntent = null;
    this.emitGesturePreview();
  };

  private readonly preventContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private updateGesture(event: PointerEvent) {
    if (!this.gestureIntent) {
      const distance = Math.hypot(event.clientX - this.gestureStart.x, event.clientY - this.gestureStart.y);
      if (distance >= GESTURE_THRESHOLD) {
        const intent = this.intentFromDirection(event.clientX - this.gestureStart.x, event.clientY - this.gestureStart.y);
        if (intent) {
          this.gestureIntent = intent;
          this.roleStart.set(event.clientX, event.clientY);
        }
      }
      return;
    }

    const distance = Math.hypot(event.clientX - this.roleStart.x, event.clientY - this.roleStart.y);
    if (distance >= GESTURE_THRESHOLD) {
      this.gestureRole = this.roleFromDirection(event.clientX - this.roleStart.x, event.clientY - this.roleStart.y);
    }
  }

  private roleFromDirection(x: number, y: number): PartyRole | null {
    const direction = this.nearestCardinalDirection(x, y);
    if (!direction) {
      return null;
    }

    const roles: Record<"right" | "left" | "up" | "down", PartyRole> = {
      right: "melee",
      left: "ranged",
      up: "tank",
      down: "healer",
    };
    return roles[direction];
  }

  private intentFromDirection(x: number, y: number): GestureIntent | null {
    const direction = this.nearestCardinalDirection(x, y);
    if (!direction) {
      return null;
    }

    const intents: Partial<Record<"right" | "left" | "up" | "down", GestureIntent>> = {
      up: "move",
      down: "attention",
    };
    return intents[direction] ?? null;
  }

  private nearestCardinalDirection(x: number, y: number): "right" | "left" | "up" | "down" | null {
    const angle = Math.atan2(y, x);
    const candidates = [
      { name: "right" as const, angle: 0 },
      { name: "down" as const, angle: Math.PI / 2 },
      { name: "left" as const, angle: Math.PI },
      { name: "up" as const, angle: -Math.PI / 2 },
    ];

    let closest = candidates[0];
    let closestDistance = this.angularDistance(angle, closest.angle);
    for (const candidate of candidates.slice(1)) {
      const distance = this.angularDistance(angle, candidate.angle);
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }

    return closestDistance <= GESTURE_DIRECTION_TOLERANCE ? closest.name : null;
  }

  private angularDistance(a: number, b: number) {
    const distance = Math.abs(a - b) % (Math.PI * 2);
    return distance > Math.PI ? Math.PI * 2 - distance : distance;
  }

  private emitGesturePreview() {
    this.callbacks.setGesturePreview(this.gesture);
  }

  private isUiEvent(event: Event) {
    return event.target instanceof Element && event.target.closest(".ui-layer");
  }

  private updatePointerWorld(event: PointerEvent) {
    this.pointerClient.set(event.clientX, event.clientY);
    this.hasPointerClient = true;
    this.refreshPointerWorld();
  }

  private refreshPointerWorld() {
    if (!this.hasPointerClient) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((this.pointerClient.x - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -(((this.pointerClient.y - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    this.raycaster.ray.intersectPlane(this.groundPlane, this.pointerWorld);
    this.pointerWorld.x = clamp(this.pointerWorld.x, -WORLD_HALF_WIDTH, WORLD_HALF_WIDTH);
    this.pointerWorld.y = 0;
    this.pointerWorld.z = clamp(this.pointerWorld.z, -WORLD_HALF_HEIGHT, WORLD_HALF_HEIGHT);
  }
}
