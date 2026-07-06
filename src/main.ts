import { RpgGame } from "./game/RpgGame";
import "./style.css";

const game = new RpgGame();

if (import.meta.env.DEV) {
  (window as Window & { __RPG_GAME__?: RpgGame }).__RPG_GAME__ = game;
}

