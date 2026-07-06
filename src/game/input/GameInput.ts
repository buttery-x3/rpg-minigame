import * as THREE from "three";
import { WORLD_BOUNDS } from "../../config";
import { clamp } from "../../lib/math";

type InputCallbacks = {
  isPaused: () => boolean;
  setMoveTarget: (target: THREE.Vector3) => void;
  togglePaused: () => void;
};

const HELD_MOVE_REFIRE_SECONDS = 0.08;

export class GameInput {
  readonly pointerWorld = new THREE.Vector3();

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly pointerClient = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pressedPointerId: number | null = null;
  private hasPointerClient = false;
  private moveRequestPending = false;
  private heldMoveRefireIn = 0;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly callbacks: InputCallbacks,
  ) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerUp);
    window.addEventListener("contextmenu", this.preventContextMenu);
  }

  update(dt: number) {
    this.refreshPointerWorld();

    if (!this.isHoldingMove()) {
      this.moveRequestPending = false;
      this.heldMoveRefireIn = 0;
      return;
    }

    this.heldMoveRefireIn -= dt;
    if (this.heldMoveRefireIn <= 0) {
      this.moveRequestPending = true;
      this.heldMoveRefireIn = HELD_MOVE_REFIRE_SECONDS;
    }
  }

  consumeMoveRequest() {
    const shouldMove = this.isHoldingMove() && this.moveRequestPending;
    this.moveRequestPending = false;
    return shouldMove;
  }

  get holdingMove() {
    return this.isHoldingMove();
  }

  dispose() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener("contextmenu", this.preventContextMenu);
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) {
      return;
    }

    if (event.key === "Escape") {
      this.callbacks.togglePaused();
    }
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.callbacks.isPaused() || this.isUiEvent(event)) {
      return;
    }

    this.updatePointerWorld(event);
    this.pressedPointerId = event.pointerId;
    this.moveRequestPending = false;
    this.heldMoveRefireIn = HELD_MOVE_REFIRE_SECONDS;
    this.callbacks.setMoveTarget(this.pointerWorld);
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.isUiEvent(event)) {
      return;
    }

    this.updatePointerWorld(event);
    if (this.isHoldingMove()) {
      this.moveRequestPending = true;
    }
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (event.pointerId === this.pressedPointerId) {
      this.pressedPointerId = null;
      this.moveRequestPending = false;
      this.heldMoveRefireIn = 0;
    }
  };

  private readonly preventContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private isHoldingMove() {
    return this.pressedPointerId !== null && !this.callbacks.isPaused();
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
    this.pointerWorld.x = clamp(this.pointerWorld.x, -WORLD_BOUNDS, WORLD_BOUNDS);
    this.pointerWorld.y = 0;
    this.pointerWorld.z = clamp(this.pointerWorld.z, -WORLD_BOUNDS, WORLD_BOUNDS);
  }
}

