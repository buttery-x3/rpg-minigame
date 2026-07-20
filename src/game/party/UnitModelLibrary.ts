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
    Object.entries(roleModelUrls).map(async ([role, url]) => [role, (await loader.loadAsync(url)).scene] as const),
  );
  return Object.fromEntries(entries) as Partial<Record<PartyRole, THREE.Object3D>>;
}
