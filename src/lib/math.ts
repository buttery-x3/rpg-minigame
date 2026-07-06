import * as THREE from "three";

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function damp(current: number, target: number, smoothing: number, dt: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.pow(smoothing, dt));
}

export function vecToTuple(vector: THREE.Vector3): [number, number, number] {
  return [round(vector.x), round(vector.y), round(vector.z)];
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

