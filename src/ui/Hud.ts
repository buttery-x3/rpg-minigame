import type { FormationType, GesturePreview, PartyRole } from "../types";
import type { PartyController } from "../game/party/PartyController";
import type { PartyGroup } from "../game/party/PartyGroup";

const roleLabels: Partial<Record<PartyRole, string>> = {
  tank: "Tank",
  melee: "Melee DPS",
  ranged: "Ranged DPS",
  healer: "Healer",
};

const roleColors: Partial<Record<PartyRole, string>> = {
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

const formationIcons: Record<FormationType, string> = {
  triangle: "△",
  "tight-circle": "◉",
  "loose-circle": "○",
  "horizontal-line": "↔",
  "vertical-line": "↕",
};

type GroupPanel = {
  panel: HTMLElement;
  title: HTMLElement;
  count: HTMLElement;
  list: HTMLElement;
  formationButtons: Map<FormationType, HTMLButtonElement>;
};

export class Hud {
  readonly element = document.createElement("div");

  private readonly partyGroups: HTMLElement;
  private readonly locationValue: HTMLElement;
  private readonly stateValue: HTMLElement;
  private readonly formationMessage: HTMLElement;
  private readonly pauseShade = document.createElement("div");
  private readonly gestureMenu: HTMLElement;
  private readonly gestureTitle: HTMLElement;
  private readonly memberCards = new Map<string, { card: HTMLElement; health: HTMLElement; bar: HTMLElement }>();
  private readonly groupPanels = new Map<string, GroupPanel>();

  constructor(
    private readonly party: PartyController,
    private readonly callbacks: {
      setFormation: (groupId: string, formation: FormationType) => void;
      returnGroup: (groupId: string) => void;
      setCameraAngle: (angle: number) => void;
      setCameraHeight: (height: number) => void;
      setCameraFov: (fov: number) => void;
    },
  ) {
    this.element.className = "ui-layer";
    this.element.innerHTML = `
      <div class="party-panel-stack" data-party-groups></div>
      <section class="quest-panel" aria-label="Quest">
        <span class="quest-panel__label">Old Gate</span>
        <strong data-hud-location></strong>
        <span data-hud-state></span>
        <small data-formation-message></small>
      </section>
      <section class="camera-panel" aria-label="Camera controls" hidden>
        <strong>Camera</strong>
        <label>Vertical angle <output data-camera-angle-value>67°</output><input data-camera-angle type="range" min="15" max="75" value="67" step="1" /></label>
        <label>Height <output data-camera-height-value>40</output><input data-camera-height type="range" min="10" max="50" value="40" step="1" /></label>
        <label>FOV <output data-camera-fov-value>50°</output><input data-camera-fov type="range" min="30" max="90" value="50" step="1" /></label>
      </section>
      <button class="camera-toggle" type="button" aria-label="Show camera controls" aria-expanded="false" data-camera-toggle>⚙</button>
      <div class="gesture-menu" data-gesture-menu hidden>
        <div class="gesture-menu__title" data-gesture-title>Choose an order</div>
        <div class="gesture-menu__roles">
          <span data-gesture-role="tank" aria-label="Tank">🛡️</span>
          <span data-gesture-role="melee" aria-label="Melee">⚔️</span>
          <span data-gesture-role="ranged" aria-label="Ranged">🧙</span>
          <span data-gesture-role="healer" aria-label="Healer">➕</span>
        </div>
        <div class="gesture-menu__intents" data-gesture-intents>
          <span data-gesture-intent="move">Move here</span>
          <span data-gesture-intent="attention">Attention</span>
        </div>
      </div>
    `;

    this.partyGroups = this.require<HTMLElement>("[data-party-groups]");
    this.locationValue = this.require<HTMLElement>("[data-hud-location]");
    this.stateValue = this.require<HTMLElement>("[data-hud-state]");
    this.formationMessage = this.require<HTMLElement>("[data-formation-message]");
    this.gestureMenu = this.require<HTMLElement>("[data-gesture-menu]");
    this.gestureTitle = this.require<HTMLElement>("[data-gesture-title]");
    this.syncGroupPanels();

    const cameraPanel = this.require<HTMLElement>(".camera-panel");
    const cameraToggle = this.require<HTMLButtonElement>("[data-camera-toggle]");
    cameraToggle.addEventListener("click", () => {
      cameraPanel.hidden = !cameraPanel.hidden;
      cameraToggle.setAttribute("aria-expanded", `${!cameraPanel.hidden}`);
      cameraToggle.setAttribute("aria-label", cameraPanel.hidden ? "Show camera controls" : "Hide camera controls");
    });

    this.bindCameraControl("[data-camera-angle]", "[data-camera-angle-value]", (value) => `${value}°`, callbacks.setCameraAngle);
    this.bindCameraControl("[data-camera-height]", "[data-camera-height-value]", (value) => `${value}`, callbacks.setCameraHeight);
    this.bindCameraControl("[data-camera-fov]", "[data-camera-fov-value]", (value) => `${value}°`, callbacks.setCameraFov);

    this.pauseShade.className = "pause-shade";
    this.pauseShade.textContent = "Paused";
    this.element.append(this.pauseShade);
  }

  update(paused: boolean) {
    this.syncGroupPanels();
    this.party.members.forEach((member) => {
      const elements = this.memberCards.get(member.id);
      if (!elements) {
        return;
      }
      const health = Math.round(member.health);
      elements.health.textContent = `${health}`;
      elements.bar.style.width = `${(member.health / member.maxHealth) * 100}%`;
    });

    this.party.groups.forEach((group) => {
      const panel = this.groupPanels.get(group.id);
      if (!panel) {
        return;
      }
      panel.title.textContent = this.groupLabel(group);
      panel.count.textContent = `${group.members.length} members`;
      group.members.forEach((member) => panel.list.append(this.memberCards.get(member.id)?.card ?? document.createElement("div")));
      panel.formationButtons.forEach((button, formation) => button.classList.toggle("is-selected", formation === group.formation));
    });

    this.locationValue.textContent = this.party.position.z > 6 ? "Gateward Road" : "Mosswake Field";
    this.stateValue.textContent = this.party.isMoving() ? "Moving with WASD" : "Ready for orders";
    this.formationMessage.textContent = this.party.formationMessage;
    this.pauseShade.hidden = !paused;
  }

  setGesturePreview(preview: GesturePreview) {
    this.gestureMenu.hidden = !preview.active;
    if (!preview.active) {
      return;
    }
    this.gestureMenu.style.left = `${preview.screenX}px`;
    this.gestureMenu.style.top = `${preview.screenY}px`;
    this.gestureMenu.classList.toggle("gesture-menu--nested", preview.intent !== null);
    this.gestureTitle.textContent = preview.intent ? "Choose a role" : "Choose an order";
    this.gestureMenu.querySelectorAll<HTMLElement>("[data-gesture-role]").forEach((element) => {
      element.classList.toggle("is-selected", element.dataset.gestureRole === preview.role);
    });
    this.gestureMenu.querySelectorAll<HTMLElement>("[data-gesture-intent]").forEach((element) => {
      element.classList.toggle("is-selected", element.dataset.gestureIntent === preview.intent);
    });
    this.requireFrom<HTMLElement>(this.gestureMenu, "[data-gesture-intents]").hidden = preview.intent !== null;
  }

  private syncGroupPanels() {
    const liveGroupIds = new Set(this.party.groups.map((group) => group.id));
    this.groupPanels.forEach((panel, groupId) => {
      if (!liveGroupIds.has(groupId)) {
        panel.panel.remove();
        this.groupPanels.delete(groupId);
      }
    });
    this.party.groups.forEach((group) => this.ensureGroupPanel(group));
  }

  private ensureGroupPanel(group: PartyGroup) {
    if (this.groupPanels.has(group.id)) {
      return;
    }
    const panel = document.createElement("section");
    panel.className = "party-panel";
    panel.dataset.partyGroup = group.id;
    panel.innerHTML = `
      <div class="party-panel__content">
        <div class="party-panel__header"><strong data-party-title></strong><span data-party-count></span></div>
        <div class="party-list" data-party-list></div>
      </div>
      <nav class="party-panel__formations" aria-label="Party formations"></nav>
    `;
    const formations = this.requireFrom<HTMLElement>(panel, ".party-panel__formations");
    const formationButtons = new Map<FormationType, HTMLButtonElement>();
    (Object.keys(formationLabels) as FormationType[]).forEach((formation) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.formation = formation;
      button.title = formationLabels[formation];
      button.setAttribute("aria-label", formationLabels[formation]);
      button.textContent = formationIcons[formation];
      button.addEventListener("click", () => this.callbacks.setFormation(group.id, formation));
      formations.append(button);
      formationButtons.set(formation, button);
    });
    if (!group.isMain) {
      const returnButton = document.createElement("button");
      returnButton.type = "button";
      returnButton.className = "party-panel__return";
      returnButton.title = "Return to main party";
      returnButton.setAttribute("aria-label", "Return to main party");
      returnButton.textContent = "↩";
      returnButton.addEventListener("click", () => this.callbacks.returnGroup(group.id));
      formations.append(returnButton);
    }
    this.partyGroups.append(panel);
    this.groupPanels.set(group.id, {
      panel,
      title: this.requireFrom(panel, "[data-party-title]"),
      count: this.requireFrom(panel, "[data-party-count]"),
      list: this.requireFrom(panel, "[data-party-list]"),
      formationButtons,
    });
    group.members.forEach((member) => this.ensureMemberCard(member.id));
  }

  private ensureMemberCard(memberId: string) {
    if (this.memberCards.has(memberId)) {
      return;
    }
    const member = this.party.members.find((candidate) => candidate.id === memberId);
    if (!member) {
      return;
    }
    const card = document.createElement("div");
    card.className = "member-card";
    card.dataset.memberId = member.id;
    card.innerHTML = `
      <span class="member-card__portrait" style="--role-color: ${this.roleColor(member.role)}">${member.displayName.slice(0, 1)}</span>
      <span class="member-card__details"><strong>${member.displayName}</strong><small>${this.roleLabel(member.role)}</small><span class="member-card__meter"><span data-member-health-bar></span></span></span>
      <b data-member-health></b>
    `;
    this.memberCards.set(member.id, { card, health: this.requireFrom(card, "[data-member-health]"), bar: this.requireFrom(card, "[data-member-health-bar]") });
  }

  private groupLabel(group: PartyGroup) {
    return group.isMain ? "Party" : `${group.roles.map((role) => this.roleLabel(role)).join(" / ")} Party`;
  }

  private roleLabel(role: PartyRole) {
    return roleLabels[role] ?? role.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private roleColor(role: PartyRole) {
    return roleColors[role] ?? "#9ba7ad";
  }

  private require<T extends Element>(selector: string) {
    return this.requireFrom<T>(this.element, selector);
  }

  private bindCameraControl(inputSelector: string, outputSelector: string, format: (value: number) => string, setValue: (value: number) => void) {
    const input = this.require<HTMLInputElement>(inputSelector);
    const output = this.require<HTMLOutputElement>(outputSelector);
    input.addEventListener("input", () => {
      const value = Number(input.value);
      output.value = format(value);
      setValue(value);
    });
  }

  private requireFrom<T extends Element>(root: ParentNode, selector: string) {
    const element = root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing HUD element: ${selector}`);
    }
    return element;
  }
}
