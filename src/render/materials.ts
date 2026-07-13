import * as THREE from "three";

export const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0x556f3a, roughness: 0.92, metalness: 0.02 }),
  grassDark: new THREE.MeshStandardMaterial({ color: 0x334c36, roughness: 0.96 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8d8a7f, roughness: 0.78 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x575c62, roughness: 0.86 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x5b3d2a, roughness: 0.88 }),
  leaves: new THREE.MeshStandardMaterial({ color: 0x2f6d4f, roughness: 0.9 }),
  water: new THREE.MeshStandardMaterial({
    color: 0x3e8ca4,
    roughness: 0.38,
    metalness: 0.05,
    transparent: true,
    opacity: 0.78,
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
