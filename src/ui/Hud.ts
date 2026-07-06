import type { PlayerController } from "../game/player/PlayerController";

export class Hud {
  readonly element = document.createElement("div");

  private readonly healthValue = document.createElement("span");
  private readonly staminaValue = document.createElement("span");
  private readonly locationValue = document.createElement("span");
  private readonly stateValue = document.createElement("span");
  private readonly pauseShade = document.createElement("div");

  constructor(private readonly player: PlayerController) {
    this.element.className = "ui-layer";
    this.element.innerHTML = `
      <section class="hud" aria-label="Character status">
        <div class="hud__row"><span>HP</span><strong data-hud-health></strong></div>
        <div class="meter"><span data-health-meter></span></div>
        <div class="hud__row"><span>STA</span><strong data-hud-stamina></strong></div>
        <div class="meter meter--stamina"><span data-stamina-meter></span></div>
      </section>
      <section class="quest-panel" aria-label="Quest">
        <span class="quest-panel__label">Old Gate</span>
        <strong data-hud-location></strong>
        <span data-hud-state></span>
      </section>
      <nav class="action-bar" aria-label="Abilities">
        <button type="button" aria-label="Strike"><span>1</span><strong></strong></button>
        <button type="button" aria-label="Guard"><span>2</span><strong></strong></button>
        <button type="button" aria-label="Potion"><span>3</span><strong></strong></button>
      </nav>
    `;

    this.healthValue = this.require("[data-hud-health]");
    this.staminaValue = this.require("[data-hud-stamina]");
    this.locationValue = this.require("[data-hud-location]");
    this.stateValue = this.require("[data-hud-state]");
    this.pauseShade.className = "pause-shade";
    this.pauseShade.textContent = "Paused";
    this.element.append(this.pauseShade);
  }

  update(paused: boolean) {
    const health = Math.round(this.player.health);
    const stamina = Math.round(this.player.stamina);
    this.healthValue.textContent = `${health}`;
    this.staminaValue.textContent = `${stamina}`;
    this.locationValue.textContent = this.player.position.z > 6 ? "Gateward Road" : "Mosswake Field";
    this.stateValue.textContent = this.player.isMoving() ? "Traveling" : "Ready";
    this.element.style.setProperty("--health", `${health}%`);
    this.element.style.setProperty("--stamina", `${stamina}%`);
    this.pauseShade.hidden = !paused;
  }

  private require<T extends Element>(selector: string) {
    const element = this.element.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing HUD element: ${selector}`);
    }
    return element;
  }
}

