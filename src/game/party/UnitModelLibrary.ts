import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import tankUrl from "../../assets/tank-lite.glb?url";
import rogueUrl from "../../assets/rogue-lite.glb?url";
import mageUrl from "../../assets/mage-lite.glb?url";
import healerUrl from "../../assets/healer-lite.glb?url";
import type { PartyRole } from "../../types";

const loader = new GLTFLoader();

const roleModelUrls: Record<"tank" | "melee" | "ranged" | "healer", string> = {
  tank: tankUrl,
  melee: rogueUrl,
  ranged: mageUrl,
  healer: healerUrl,
};

export async function loadUnitModels() {
  const entries = await Promise.all(
    Object.entries(roleModelUrls).map(async ([role, url]) => {
      const scene = (await loader.loadAsync(url)).scene;
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial && material.map) {
            material.map.anisotropy = 8;
            material.map.needsUpdate = true;
          }
        });
      });
      return [role, scene] as const;
    }),
  );
  return Object.fromEntries(entries) as Partial<Record<PartyRole, THREE.Object3D>>;
}

export function renderUnitPortraits(models: Partial<Record<PartyRole, THREE.Object3D>>) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(160, 160, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);
  const portraits: Partial<Record<PartyRole, string>> = {};

  Object.entries(models).forEach(([role, template]) => {
    if (!template) return;
    const scene = new THREE.Scene();
    const model = template.clone(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 2.35 / Math.max(size.y, 0.01);
    model.scale.setScalar(scale);
    const scaledBounds = new THREE.Box3().setFromObject(model);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -scaledBounds.min.y - 0.15, -center.z);
    model.rotation.y = -0.32;
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xfff4d6, 0x243143, 2.2));
    const key = new THREE.DirectionalLight(0xffd68a, 3.4);
    key.position.set(-3, 5, 4);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 20);
    camera.position.set(0, 1.18, 5.2);
    camera.lookAt(0, 1.12, 0);
    renderer.render(scene, camera);
    portraits[role] = renderer.domElement.toDataURL("image/png");
  });
  renderer.dispose();
  return portraits;
}
