import * as THREE from "three";
import { WORLD_HALF_HEIGHT } from "../../config";
import type { FormationType, PartyCommand, PartyRole } from "../../types";
import { CombatSimulation } from "../combat/CombatSimulation";
import { roleStats } from "../combat/combatBalance";
import { abilityCatalog, starterAbilityLoadouts } from "../combat/abilityCatalog";
import { buildPlayerView } from "../combat/buildPlayerView";
import type { AbilityId, CombatRole, CombatStance, UnitStats } from "../combat/types";
import { PartyGroup } from "./PartyGroup";
import { PartyMember } from "./PartyMember";
import { loadUnitModels, renderUnitPortraits } from "./UnitModelLibrary";

const enemyWaves: Array<{ z: number; roles: CombatRole[] }> = [
  { z: 55, roles: ["tank", "melee", "ranged", "healer"] },
  { z: 28, roles: ["tank", "melee", "melee", "ranged", "ranged", "healer"] },
  { z: 0, roles: ["tank", "tank", "melee", "melee", "ranged", "ranged", "healer", "healer"] },
  { z: -34, roles: ["tank", "tank", "melee", "melee", "melee", "ranged", "ranged", "ranged", "healer", "healer"] },
];

const enemyNames: Record<CombatRole, string[]> = {
  tank: ["Brute", "Bulwark", "Warden", "Ironhide"],
  melee: ["Raider", "Cutthroat", "Reaver", "Blade"],
  ranged: ["Hexer", "Archer", "Invoker", "Seer"],
  healer: ["Acolyte", "Mender", "Oracle", "Priest"],
};

export class PartyController {
  readonly group = new THREE.Group();
  private readonly moveInput = new THREE.Vector2();
  private readonly membersInternal: PartyMember[];
  private readonly enemiesInternal: PartyMember[];
  readonly combat = new CombatSimulation();
  private readonly mainGroup: PartyGroup;
  private readonly groupsInternal: PartyGroup[];
  private lastFormationMessage = "Triangle formation";
  private groupSequence = 0;
  private combatAccumulator = 0;
  private moving = false;
  private readonly cameraFocusInternal = new THREE.Vector3();
  private readonly portraitsInternal: Partial<Record<PartyRole, string>> = {};

  constructor() {
    this.group.name = "Party";
    this.membersInternal = [
      this.createMember("tank-1", "Bram", "tank"),
      this.createMember("tank-2", "Orrin", "tank"),
      this.createMember("melee-1", "Kest", "melee"),
      this.createMember("melee-2", "Veya", "melee"),
      this.createMember("melee-3", "Jax", "melee"),
      this.createMember("ranged-1", "Iria", "ranged"),
      this.createMember("ranged-2", "Sol", "ranged"),
      this.createMember("ranged-3", "Nilo", "ranged"),
      this.createMember("healer-1", "Mira", "healer"),
      this.createMember("healer-2", "Senn", "healer"),
    ];
    this.mainGroup = new PartyGroup("main", true, this.membersInternal);
    this.mainGroup.position.set(0, 0, WORLD_HALF_HEIGHT - 12);
    this.groupsInternal = [this.mainGroup];
    this.group.add(this.mainGroup.group);
    this.mainGroup.update(0);
    this.combat.addGroup("main", "party", "balanced", "player-1");
    this.combat.setGroupAnchor("main", { x: this.mainGroup.position.x, z: this.mainGroup.position.z });
    this.membersInternal.forEach((member) => this.addCombatMember(member, "party", "main"));
    const enemies: PartyMember[] = [];
    enemyWaves.forEach((wave, waveIndex) => {
      const groupId = `enemy-wave-${waveIndex + 1}`;
      this.combat.addGroup(groupId, "enemy", waveIndex === 0 ? "balanced" : "aggressive", `cpu-${waveIndex + 1}`, "computer");
      this.combat.setGroupAnchor(groupId, { x: 0, z: wave.z });
      const columns = Math.min(5, Math.ceil(Math.sqrt(wave.roles.length)));
      const rows = Math.ceil(wave.roles.length / columns);
      const roleCounts = new Map<CombatRole, number>();
      wave.roles.forEach((role, index) => {
        const roleIndex = roleCounts.get(role) ?? 0;
        roleCounts.set(role, roleIndex + 1);
        const id = `enemy-${waveIndex + 1}-${role}-${roleIndex + 1}`;
        const displayName = `${enemyNames[role][waveIndex]} ${roleIndex + 1}`;
        const member = this.createMember(id, displayName, role, "enemy");
        const column = index % columns;
        const row = Math.floor(index / columns);
        member.position.set((column - (columns - 1) / 2) * 2.15, 0, wave.z + (row - (rows - 1) / 2) * 2.15);
        this.group.add(member.group);
        member.refreshWorldPosition();
        this.addCombatMember(member, "enemy", groupId);
        enemies.push(member);
      });
    });
    this.enemiesInternal = enemies;
  }

  get position() {
    return this.mainGroup.position;
  }

  get members() {
    return this.membersInternal;
  }

  get enemies() { return this.enemiesInternal; }
  get portraits() { return this.portraitsInternal; }

  async loadVisualAssets() {
    try {
      const models = await loadUnitModels();
      Object.assign(this.portraitsInternal, renderUnitPortraits(models));
      [...this.membersInternal, ...this.enemiesInternal].forEach((member) => {
        const model = models[member.role];
        if (model) member.applyModel(model);
      });
    } catch (error) {
      console.warn("Unit models could not be loaded; using fallback meshes.", error);
    }
  }

  get playerView() { return buildPlayerView(this.combat, "player-1"); }

  get groups() {
    return this.groupsInternal;
  }

  get formation() {
    return this.mainGroup.formation;
  }

  get formationMessage() {
    return this.lastFormationMessage;
  }

  get headingAngle() {
    return this.mainGroup.headingAngle;
  }

  get cameraFocus() {
    const livingMembers = this.membersInternal.filter((member) => member.alive);
    if (livingMembers.length > 0) {
      this.cameraFocusInternal.copy(livingMembers.reduce((center, member) => center.add(member.worldPosition), new THREE.Vector3()).multiplyScalar(1 / livingMembers.length));
    } else {
      this.cameraFocusInternal.copy(this.mainGroup.position);
    }
    const hasEngagement = this.groupsInternal.some((group) => this.combat.groups.get(group.id)?.engagedFactionIds.includes("enemy"));
    const engaged = hasEngagement ? this.enemiesInternal.filter((member) => member.alive && member.worldPosition.distanceTo(this.cameraFocusInternal) <= 30) : [];
    if (engaged.length > 0) {
      const enemyCenter = engaged.reduce((center, member) => center.add(member.worldPosition), new THREE.Vector3()).multiplyScalar(1 / engaged.length);
      this.cameraFocusInternal.lerp(enemyCenter, 0.35);
    }
    return this.cameraFocusInternal;
  }

  get loadedModelCount() {
    return [...this.membersInternal, ...this.enemiesInternal].filter((member) => member.hasModel).length;
  }

  setMoveInput(input: THREE.Vector2) {
    this.moveInput.copy(input);
    if (this.moveInput.lengthSq() > 1) {
      this.moveInput.normalize();
    }
  }

  setFormation(groupId: string, formation: FormationType) {
    const partyGroup = this.groupsInternal.find((candidate) => candidate.id === groupId);
    if (!partyGroup?.setFormation(formation)) {
      return;
    }
    this.lastFormationMessage = `${this.formatFormationName(formation)} formation`;
  }

  update(dt: number) {
    this.moving = this.moveInput.lengthSq() > 0;
    this.mainGroup.update(dt, this.moveInput);
    this.groupsInternal.filter((partyGroup) => !partyGroup.isMain).forEach((partyGroup) => partyGroup.update(dt, this.moveInput));
    this.groupsInternal.forEach((partyGroup) => this.combat.setGroupAnchor(partyGroup.id, { x: partyGroup.position.x, z: partyGroup.position.z }));
    if (this.moving) {
      this.groupsInternal.forEach((partyGroup) => this.combat.enqueueCommand({ type: "move", groupId: partyGroup.id, ownerId: "player-1", position: { x: partyGroup.position.x, z: partyGroup.position.z } }));
    }
    this.membersInternal.forEach((member) => {
      member.refreshWorldPosition();
      if (!member.alive) return;
      if (!member.inCombat) this.combat.setUnitHome(member.id, { x: member.worldPosition.x, z: member.worldPosition.z });
      this.combat.setUnitPosition(member.id, { x: member.worldPosition.x, z: member.worldPosition.z });
    });
    this.enemiesInternal.forEach((member) => {
      member.refreshWorldPosition();
      if (!member.inCombat) {
        this.combat.setUnitHome(member.id, { x: member.worldPosition.x, z: member.worldPosition.z });
        this.combat.setUnitPosition(member.id, { x: member.worldPosition.x, z: member.worldPosition.z });
      }
    });
    this.combatAccumulator = Math.min(this.combatAccumulator + dt, 0.2);
    while (this.combatAccumulator >= 1 / 30) {
      this.combat.update(1 / 30);
      this.combatAccumulator -= 1 / 30;
    }
    this.groupsInternal.forEach((partyGroup) => {
      const combatGroup = this.combat.groups.get(partyGroup.id);
      if (combatGroup) partyGroup.position.set(combatGroup.anchor.x, partyGroup.position.y, combatGroup.anchor.z);
    });
    [...this.membersInternal, ...this.enemiesInternal].forEach((member) => this.syncCombatMember(member));
  }

  isMoving() {
    return this.moving;
  }

  issueRoleCommand(role: PartyRole, command: PartyCommand, target: THREE.Vector3) {
    const partyGroup = this.groupForRole(role);
    if (!partyGroup) {
      return;
    }

    const movingGroup = partyGroup.isMain ? this.detachRole(role) ?? partyGroup : partyGroup;
    this.combat.enqueueCommand({ type: "move", groupId: movingGroup.id, ownerId: "player-1", position: { x: target.x, z: target.z } });
  }

  returnGroup(groupId: string) {
    const detachedGroup = this.groupsInternal.find((candidate) => candidate.id === groupId && !candidate.isMain);
    if (!detachedGroup) {
      return;
    }

    this.group.updateMatrixWorld(true);
    const members = [...detachedGroup.members];
    const worldPositions = new Map<string, THREE.Vector3>();
    members.forEach((member) => worldPositions.set(member.id, member.worldPosition.clone()));
    detachedGroup.releaseMembers(members);
    for (const member of members) {
      const localPosition = this.mainGroup.group.worldToLocal(worldPositions.get(member.id)?.clone() ?? new THREE.Vector3());
      this.mainGroup.addMembers([member]);
      member.position.copy(localPosition);
      this.combat.setUnitGroup(member.id, this.mainGroup.id);
    }
    this.mainGroup.sortMembers((left, right) => this.membersInternal.indexOf(left) - this.membersInternal.indexOf(right));
    this.group.remove(detachedGroup.group);
    this.groupsInternal.splice(this.groupsInternal.indexOf(detachedGroup), 1);
    this.combat.removeGroup(detachedGroup.id);
    this.lastFormationMessage = "Party reunited";
  }

  setStance(groupId: string, stance: CombatStance) {
    this.combat.enqueueCommand({ type: "set-stance", groupId, ownerId: "player-1", stance });
    this.lastFormationMessage = `${stance.charAt(0).toUpperCase()}${stance.slice(1)} stance`;
  }

  recallGroup(groupId: string) {
    const partyGroup = this.groupsInternal.find((candidate) => candidate.id === groupId);
    partyGroup?.members.forEach((member) => {
      const home = partyGroup.getFormationWorldPosition(member.id);
      if (home) this.combat.setUnitHome(member.id, { x: home.x, z: home.z });
    });
    this.combat.enqueueCommand({ type: "recall", groupId, ownerId: "player-1" });
    this.lastFormationMessage = "Returning to formation";
  }

  getGroupStance(groupId: string): CombatStance {
    return this.combat.groups.get(groupId)?.stance ?? "balanced";
  }

  getAbilityStatus(memberId: string) {
    const unit = this.combat.units.get(memberId);
    if (!unit) return "";
    return unit.abilities.map((id) => {
      const cooldown = unit.cooldowns[id] ?? 0;
      return cooldown > 0 ? `${abilityCatalog[id].label} ${cooldown.toFixed(1)}s` : `${abilityCatalog[id].label} ready`;
    }).join(" · ");
  }

  configureMember(memberId: string, config: { stats?: Partial<UnitStats>; abilities?: AbilityId[] }) {
    return this.combat.configureUnit(memberId, config);
  }

  getLowestHealthMember() {
    return this.membersInternal.reduce((lowest, member) => (member.health < lowest.health ? member : lowest));
  }

  private detachRole(role: PartyRole) {
    const members = this.mainGroup.members.filter((member) => member.role === role);
    if (members.length === 0) {
      return;
    }
    const detachedGroup = new PartyGroup(`group-${this.groupSequence += 1}`, false, [], this.mainGroup.headingAngle);
    detachedGroup.position.copy(this.mainGroup.position);
    this.mainGroup.releaseMembers(members);
    detachedGroup.addMembers(members);
    this.groupsInternal.push(detachedGroup);
    this.group.add(detachedGroup.group);
    this.combat.addGroup(detachedGroup.id, "party", this.getGroupStance("main"), "player-1");
    this.combat.setGroupAnchor(detachedGroup.id, { x: detachedGroup.position.x, z: detachedGroup.position.z });
    members.forEach((member) => this.combat.setUnitGroup(member.id, detachedGroup.id));
    return detachedGroup;
  }

  private groupForRole(role: PartyRole) {
    return this.groupsInternal.find((partyGroup) => partyGroup.containsRole(role));
  }

  private addCombatMember(member: PartyMember, faction: "party" | "enemy", groupId: string) {
    const role = member.role as CombatRole;
    this.combat.addUnit({ id: member.id, name: member.displayName, faction, role, groupId, position: { x: member.worldPosition.x, z: member.worldPosition.z }, stats: roleStats[role], abilities: starterAbilityLoadouts[role] });
  }

  private syncCombatMember(member: PartyMember) {
    const state = this.combat.units.get(member.id);
    if (!state) return;
    const parent = member.group.parent;
    if (parent) {
      parent.updateMatrixWorld(true);
      const local = parent.worldToLocal(new THREE.Vector3(state.position.x, 0, state.position.z));
      member.position.copy(local);
    } else {
      member.position.set(state.position.x, 0, state.position.z);
    }
    member.syncCombat({ health: state.health, maxHealth: state.maxHealth, energy: state.energy, maxEnergy: state.maxEnergy, threat: state.threat, action: state.action, alive: state.alive, facing: state.facing, inCombat: state.targetId !== null || state.action !== "idle" });
  }

  private createMember(id: string, displayName: string, role: PartyRole, faction: "party" | "enemy" = "party") {
    return new PartyMember({ id, displayName, role, faction });
  }

  private formatFormationName(formation: FormationType) {
    return formation.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  }
}
