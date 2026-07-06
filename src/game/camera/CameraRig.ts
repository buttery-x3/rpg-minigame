import * as THREE from "three";
import { CAMERA_ZOOM } from "../../config";

export class CameraRig {
  private readonly followFocus = new THREE.Vector3();
  private readonly cameraOffset = new THREE.Vector3(22, 26, 22);

  constructor(
    private readonly camera: THREE.OrthographicCamera,
    private readonly renderer: THREE.WebGLRenderer,
  ) {}

  update(dt: number, target: THREE.Vector3) {
    const followAmount = 1 - Math.pow(0.001, dt);
    this.followFocus.lerp(target, followAmount);
    this.camera.position.copy(this.followFocus).add(this.cameraOffset);
    this.camera.lookAt(this.followFocus);
  }

  resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / Math.max(1, height);

    this.camera.left = -CAMERA_ZOOM * aspect;
    this.camera.right = CAMERA_ZOOM * aspect;
    this.camera.top = CAMERA_ZOOM;
    this.camera.bottom = -CAMERA_ZOOM;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
  };
}

