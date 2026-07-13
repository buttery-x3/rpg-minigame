import * as THREE from "three";

export const materials = {
  worldBorder: new THREE.MeshStandardMaterial({
    color: 0xe6b85c,
    emissive: 0x4a2f0c,
    roughness: 0.72,
  }),
  playerBody: new THREE.MeshStandardMaterial({ color: 0xd8a646, roughness: 0.72 }),
  playerCloak: new THREE.MeshStandardMaterial({ color: 0x5e4aa8, roughness: 0.84 }),
  tankBody: new THREE.MeshStandardMaterial({ color: 0xb96d58, roughness: 0.78 }),
  meleeBody: new THREE.MeshStandardMaterial({ color: 0xd8a646, roughness: 0.72 }),
  rangedBody: new THREE.MeshStandardMaterial({ color: 0x5f91c2, roughness: 0.76 }),
  healerBody: new THREE.MeshStandardMaterial({ color: 0x8eb96f, roughness: 0.76 }),
  partyBase: new THREE.MeshBasicMaterial({ color: 0xf1d37b, transparent: true, opacity: 0.42 }),
  marker: new THREE.MeshBasicMaterial({ color: 0xf1d37b, transparent: true, opacity: 0.75 }),
};
