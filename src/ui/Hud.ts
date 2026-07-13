import type { FormationType, GesturePreview, PartyRole } from "../types";
import type { PartyController } from "../game/party/PartyController";

const roleLabels: Record<PartyRole, string> = {
  tank: "Tank",
  melee: "Melee DPS",
  ranged: "Ranged DPS",
  healer: "Healer",
};

const roleColors: Record<PartyRole, string> = {
  tank: "#c97967",
  melee: "#e0ae4d",
  ranged: "#74a9d8",
  healer: "#8bbf78",
};

const formationLabels: Record<FormationType, string> = {
  triangle: "Triangle",
  "tight-circle": "Tight Circle",
  "loose-circle": "Loose Circle",
  "horizontal-line": "Horizontal Line",
  "vertical-line": "Vertical Line",
};

export class Hud {
  readonly element = document.createElement("div");

  private readonly partyList: HTMLElement;
  private readonly locationValue: HTMLElement;
  private readonly stateValue: HTMLElement;
  private readonly formationMessage: HTMLElement;
  private readonly pauseShade = document.createElement("div");
  private readonly gestureMenu: HTMLElement;
  private readonly gestureTitle: HTMLElement;
  private readonly memberCards = new Map<string, { card: HTMLElement; health: HTMLElement; bar: HTMLElement }>();
  private readonly formationButtons = new Map<FormationType, HTMLButtonElement>();

  constructor(
    private readonly party: PartyController,
    callbacks: {
      setFormation: (formation: FormationType) => void;
    },
  ) {
    this.element.className = "ui-layer";
    this.element.innerHTML = `
      <section class="party-panel" aria-label="Party status">
        <div class="party-panel__header"><strong>Party</strong><span>10 members</span></div>
        <div class="party-list" data-party-list></div>
      </section>
      <section class="quest-panel" aria-label="Quest">
        <span class="quest-panel__label">Old Gate</span>
        <strong data-hud-location></strong>
        <span data-hud-state></span>
        <small data-formation-message></small>
      </section>
      <nav class="action-bar" aria-label="Formations"></nav>
      <div class="gesture-menu" data-gesture-menu hidden>
        <div class="gesture-menu__title" data-gesture-title>Choose a role</div>
        <div class="gesture-menu__roles">
          <span data-gesture-role="tank">Tank</span>
          <span data-gesture-role="melee">Melee</span>
          <span data-gesture-role="ranged">Ranged</span>
          <span data-gesture-role="healer">Healer</span>
        </div>
        <div class="gesture-menu__commands" data-gesture-commands hidden>
          <span data-gesture-command="move">Move</span>
          <span data-gesture-command="hold">Hold</span>
          <span data-gesture-command="return">Return</span>
          <span data-gesture-command="cancel">Cancel</span>
        </div>
      </div>
    `;

    this.partyList = this.require<HTMLElement>("[data-party-list]");
    this.locationValue = this.require<HTMLElement>("[data-hud-location]");
    this.stateValue = this.require<HTMLElement>("[data-hud-state]");
    this.formationMessage = this.require<HTMLElement>("[data-formation-message]");
    this.gestureMenu = this.require<HTMLElement>("[data-gesture-menu]");
    this.gestureTitle = this.require<HTMLElement>("[data-gesture-title]");

    this.party.members.forEach((member) => {
      const card = document.createElement("div");
      card.className = "member-card";
      card.dataset.memberId = member.id;
      card.innerHTML = `
        <span class="member-card__portrait" style="--role-color: ${roleColors[member.role]}">${member.displayName.slice(0, 1)}</span>
        <span class="member-card__details">
          <strong>${member.displayName}</strong>
          <small>${roleLabels[member.role]}</small>
          <span class="member-card__meter"><span data-member-health-bar></span></span>
        </span>
        <b data-member-health></b>
      `;
      this.partyList.append(card);
      this.memberCards.set(member.id, {
        card,
        health: this.requireFrom(card, "[data-member-health]"),
        bar: this.requireFrom(card, "[data-member-health-bar]"),
      });
    });

    const actionBar = this.require<HTMLElement>(".action-bar");
    (Object.keys(formationLabels) as FormationType[]).forEach((formation, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.formation = formation;
      button.innerHTML = `<span>${index + 1}</span><strong>${formationLabels[formation]}</strong>`;
      button.addEventListener("click", () => callbacks.setFormation(formation));
      actionBar.append(button);
      this.formationButtons.set(formation, button);
    });

    this.pauseShade.className = "pause-shade";
    this.pauseShade.textContent = "Paused";
    this.element.append(this.pauseShade);
  }

  update(paused: boolean) {
    this.party.members.forEach((member) => {
      const elements = this.memberCards.get(member.id);
      if (!elements) {
        return;
      }
      const health = Math.round(member.health);
      elements.health.textContent = `${health}`;
      elements.bar.style.width = `${(member.health / member.maxHealth) * 100}%`;
    });

    this.locationValue.textContent = this.party.position.z > 6 ? "Gateward Road" : "Mosswake Field";
    this.stateValue.textContent = this.party.isMoving() ? "Moving with WASD" : "Ready for orders";
    this.formationMessage.textContent = this.party.formationMessage;
    this.formationButtons.forEach((button, formation) => {
      button.classList.toggle("is-selected", formation === this.party.formation);
    });
    this.pauseShade.hidden = !paused;
  }

  setGesturePreview(preview: GesturePreview) {
    this.gestureMenu.hidden = !preview.active;
    if (!preview.active) {
      return;
    }

    this.gestureMenu.style.left = `${preview.screenX}px`;
    this.gestureMenu.style.top = `${preview.screenY}px`;
    this.gestureMenu.classList.toggle("gesture-menu--nested", preview.role !== null);
    this.gestureTitle.textContent = preview.role ? `${roleLabels[preview.role]} command` : "Choose a role";
    this.gestureMenu.querySelectorAll<HTMLElement>("[data-gesture-role]").forEach((element) => {
      element.classList.toggle("is-selected", element.dataset.gestureRole === preview.role);
    });
    this.gestureMenu.querySelectorAll<HTMLElement>("[data-gesture-command]").forEach((element) => {
      element.classList.toggle("is-selected", element.dataset.gestureCommand === preview.command);
    });
    const commands = this.requireFrom<HTMLElement>(this.gestureMenu, "[data-gesture-commands]");
    commands.hidden = preview.role === null;
  }

  private require<T extends Element>(selector: string) {
    return this.requireFrom<T>(this.element, selector);
  }

  private requireFrom<T extends Element>(root: ParentNode, selector: string) {
    const element = root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing HUD element: ${selector}`);
    }
    return element;
  }
}
