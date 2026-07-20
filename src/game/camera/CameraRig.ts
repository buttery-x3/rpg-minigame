import * as THREE from "three";

export class CameraRig {
  private readonly followFocus = new THREE.Vector3();
  private readonly cameraOffset = new THREE.Vector3();
  private height = 23;
  private verticalAngle = THREE.MathUtils.degToRad(62);

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly renderer: THREE.WebGLRenderer,
  ) {}

  update(dt: number, target: THREE.Vector3) {
    const followAmount = 1 - Math.pow(0.001, dt);
    const framedTarget = this.cameraOffset.copy(target);
    framedTarget.x -= 3.5;
    this.followFocus.lerp(framedTarget, followAmount);
    this.cameraOffset.set(
      0,
      this.height,
      this.height / Math.tan(this.verticalAngle),
    );
    this.camera.position.copy(this.followFocus).add(this.cameraOffset);
    this.camera.lookAt(this.followFocus);
  }

  setVerticalAngle(degrees: number) {
    this.verticalAngle = THREE.MathUtils.degToRad(degrees);
  }

  setHeight(height: number) {
    this.height = height;
  }

  setFov(fov: number) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / Math.max(1, height);

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
  };
}
