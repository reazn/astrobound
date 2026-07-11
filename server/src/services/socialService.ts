import type { GroupMemberBeacon } from "../shared/events.js";

export interface FriendEntry {
  playerId: string;
  displayName: string;
  online: boolean;
  presence: string;
  color: string;
}

export interface GroupState {
  groupId: string;
  leaderId: string;
  memberIds: string[];
}

const MAX_GROUP = 5;

const friendsByPlayer = new Map<string, FriendEntry[]>();
const groups = new Map<string, GroupState>();
const playerGroup = new Map<string, string>();
const presence = new Map<string, string>();

const COLORS = ["#7fd6ff", "#6fbf73", "#e8623a", "#b56bff", "#ffb85a"];

export function setPresence(playerId: string, status: string) {
  presence.set(playerId, status);
}

export function getFriends(playerId: string): FriendEntry[] {
  if (!friendsByPlayer.has(playerId)) {
    friendsByPlayer.set(playerId, [
      { playerId: "seed-1", displayName: "Nova", online: true, presence: "In system", color: COLORS[0] },
    ]);
  }
  return friendsByPlayer.get(playerId)!;
}

export function addFriend(playerId: string, displayName: string): FriendEntry {
  const list = getFriends(playerId);
  const entry: FriendEntry = {
    playerId: `friend-${Date.now()}`,
    displayName,
    online: false,
    presence: "Pending",
    color: COLORS[list.length % COLORS.length],
  };
  list.push(entry);
  return entry;
}

export function getGroupForPlayer(playerId: string): GroupState | null {
  const gid = playerGroup.get(playerId);
  if (!gid) return null;
  return groups.get(gid) ?? null;
}

export function inviteToGroup(leaderId: string, targetId: string): GroupState | null {
  let gid = playerGroup.get(leaderId);
  let group: GroupState;
  if (!gid) {
    gid = `group-${Date.now().toString(36)}`;
    group = { groupId: gid, leaderId, memberIds: [leaderId] };
    groups.set(gid, group);
    playerGroup.set(leaderId, gid);
  } else {
    group = groups.get(gid)!;
  }
  if (group.memberIds.length >= MAX_GROUP) return null;
  if (!group.memberIds.includes(targetId)) {
    group.memberIds.push(targetId);
    playerGroup.set(targetId, gid);
  }
  return group;
}

export function leaveGroup(playerId: string): void {
  const gid = playerGroup.get(playerId);
  if (!gid) return;
  const group = groups.get(gid);
  if (!group) return;
  group.memberIds = group.memberIds.filter((id) => id !== playerId);
  playerGroup.delete(playerId);
  if (group.memberIds.length === 0) groups.delete(gid);
  else if (group.leaderId === playerId) group.leaderId = group.memberIds[0];
}

export function buildGroupBeacons(
  group: GroupState,
  memberSnapshots: Map<string, GroupMemberBeacon>,
): GroupMemberBeacon[] {
  return group.memberIds
    .map((id) => memberSnapshots.get(id))
    .filter((b): b is GroupMemberBeacon => !!b);
}

export function isInSameGroup(a: string, b: string): boolean {
  const ga = playerGroup.get(a);
  const gb = playerGroup.get(b);
  return !!ga && ga === gb;
}

export function getGroupMemberIds(playerId: string): string[] {
  const g = getGroupForPlayer(playerId);
  return g?.memberIds ?? [];
}
