export type Vec3Tuple = [number, number, number];

export type PartyRole = "tank" | "melee" | "ranged" | "healer";
export type PartyCommand = "move";
export type GestureIntent = PartyCommand | "attention";
export type FormationType = "triangle" | "tight-circle" | "loose-circle" | "horizontal-line" | "vertical-line";

export type GesturePreview = {
  active: boolean;
  role: PartyRole | null;
  intent: GestureIntent | null;
  screenX: number;
  screenY: number;
};

export type RpgDiagnostics = {
  frameCount: number;
  paused: boolean;
  party: {
    position: Vec3Tuple;
    moving: boolean;
    formation: FormationType;
    heading: number;
    memberCount: number;
    members: Array<{
      id: string;
      role: PartyRole;
      position: Vec3Tuple;
      health: number;
      maxHealth: number;
      ability: {
        id: string;
        cooldownRemaining: number;
      };
    }>;
  };
  camera: {
    position: Vec3Tuple;
  };
  input: {
    pointerWorld: Vec3Tuple;
    moving: boolean;
    gesture: GesturePreview;
  };
  world: {
    bounds: number;
  };
};
