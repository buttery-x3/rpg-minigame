import * as THREE from "three";
import type { FormationType, PartyRole } from "../../types";

type FormationMember = {
  id: string;
  role: PartyRole;
};

const SLOT_SPACING = 1.05;

export function buildFormationSlots(formation: FormationType, members: readonly FormationMember[]) {
  switch (formation) {
    case "triangle":
      return buildTriangleSlots(members);
    case "tight-circle":
      return buildTightCircleSlots(members);
    case "loose-circle":
      return buildCircleSlots(members, Math.max(2.8, Math.sqrt(members.length) * 0.92));
    case "horizontal-line":
      return buildHorizontalLineSlots(members);
    case "vertical-line":
      return buildVerticalLineSlots(members);
  }
}

function buildTriangleSlots(members: readonly FormationMember[]) {
  const slots = new Map<string, THREE.Vector3>();
  const ordered = orderedMembers(members);
  if (ordered.length === 0) {
    return slots;
  }

  const spearheadIndex = ordered.findIndex((member) => member.role === "tank");
  const spearhead = ordered.splice(spearheadIndex >= 0 ? spearheadIndex : 0, 1)[0];
  const rows = [[spearhead], ...splitIntoTriangleRows(ordered)];

  rows.forEach((row, rowIndex) => {
    const rowWidth = (row.length - 1) * SLOT_SPACING;
    row.forEach((member, index) => {
      slots.set(
        member.id,
        new THREE.Vector3(
          index * SLOT_SPACING - rowWidth / 2,
          0,
          (rowIndex - (rows.length - 1)) * SLOT_SPACING,
        ),
      );
    });
  });

  return slots;
}

function buildTightCircleSlots(members: readonly FormationMember[]) {
  const slots = new Map<string, THREE.Vector3>();
  const activeRoles = roleOrder(members);
  const formationDepth = activeRoles.length > 1 ? (activeRoles.length - 1) * SLOT_SPACING : 0;

  activeRoles.forEach((role, roleIndex) => {
    const roleMembers = members.filter((member) => member.role === role);
    const rowWidth = (roleMembers.length - 1) * SLOT_SPACING;
    const z = roleIndex * SLOT_SPACING - formationDepth / 2;

    roleMembers.forEach((member, memberIndex) => {
      slots.set(member.id, new THREE.Vector3(memberIndex * SLOT_SPACING - rowWidth / 2, 0, z));
    });
  });

  return slots;
}

function buildCircleSlots(members: readonly FormationMember[], radius: number) {
  const slots = new Map<string, THREE.Vector3>();
  const ordered = orderedMembers(members);
  const angleStep = (Math.PI * 2) / Math.max(1, ordered.length);

  ordered.forEach((member, index) => {
    const angle = index * angleStep;
    slots.set(member.id, new THREE.Vector3(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius));
  });

  return slots;
}

function buildHorizontalLineSlots(members: readonly FormationMember[]) {
  const slots = new Map<string, THREE.Vector3>();
  const ordered = orderedMembers(members);
  const centerOutIndices = getCenterOutIndices(ordered.length);

  ordered.forEach((member, index) => {
    const slotIndex = centerOutIndices[index];
    slots.set(member.id, new THREE.Vector3((slotIndex - (ordered.length - 1) / 2) * SLOT_SPACING, 0, 0));
  });

  return slots;
}

function buildVerticalLineSlots(members: readonly FormationMember[]) {
  const slots = new Map<string, THREE.Vector3>();
  const ordered = orderedMembers(members);

  ordered.forEach((member, index) => {
    slots.set(member.id, new THREE.Vector3(0, 0, (index - (ordered.length - 1) / 2) * SLOT_SPACING));
  });

  return slots;
}

function orderedMembers(members: readonly FormationMember[]) {
  return roleOrder(members).flatMap((role) => members.filter((member) => member.role === role));
}

function roleOrder(members: readonly FormationMember[]) {
  return [...new Set(members.map((member) => member.role))];
}

function splitIntoTriangleRows(members: FormationMember[]) {
  const rows: FormationMember[][] = [];
  let rowSize = 2;
  let cursor = 0;

  while (cursor < members.length) {
    const row = members.slice(cursor, cursor + rowSize);
    rows.push(row);
    cursor += row.length;
    rowSize += 1;
  }

  return rows;
}

function getCenterOutIndices(count: number) {
  const indices: number[] = [];
  const leftCenter = Math.floor((count - 1) / 2);
  const rightCenter = Math.ceil((count - 1) / 2);

  if (leftCenter === rightCenter) {
    indices.push(leftCenter);
  } else {
    indices.push(leftCenter, rightCenter);
  }

  for (let distance = 1; indices.length < count; distance += 1) {
    const left = leftCenter - distance;
    const right = rightCenter + distance;
    if (left >= 0) {
      indices.push(left);
    }
    if (right < count) {
      indices.push(right);
    }
  }

  return indices.slice(0, count);
}
