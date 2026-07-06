export type Vec3Tuple = [number, number, number];

export type RpgDiagnostics = {
  frameCount: number;
  paused: boolean;
  player: {
    position: Vec3Tuple;
    target: Vec3Tuple;
    moving: boolean;
    health: number;
    stamina: number;
  };
  camera: {
    position: Vec3Tuple;
  };
  input: {
    pointerWorld: Vec3Tuple;
    holdingMove: boolean;
  };
  world: {
    propCount: number;
    bounds: number;
  };
};

