import type { GroupMemberBeacon } from "../sim/events";
import type { Vec3 } from "../net/protocol";
import { beaconsToCompass } from "../net/interest";

export interface GroupCompass {
  update(selfPos: Vec3, beacons: GroupMemberBeacon[]): void;
  dispose(): void;
}

export function createGroupCompass(): GroupCompass {
  const root = document.createElement("div");
  root.className = "pointer-events-none fixed inset-0 z-30";
  document.body.appendChild(root);

  const markers = new Map<string, HTMLDivElement>();

  const update = (selfPos: Vec3, beacons: GroupMemberBeacon[]) => {
    const bearings = beaconsToCompass(selfPos, beacons);
    const seen = new Set<string>();

    for (const b of bearings) {
      seen.add(b.playerId);
      let el = markers.get(b.playerId);
      if (!el) {
        el = document.createElement("div");
        el.className =
          "absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#6fbf73] bg-[#6fbf73]/80 shadow-[0_0_8px_rgba(111,191,115,0.6)]";
        el.title = b.label;
        root.appendChild(el);
        markers.set(b.playerId, el);
      }
      const rad = (b.bearingDeg * Math.PI) / 180;
      const r = Math.min(window.innerWidth, window.innerHeight) * 0.38;
      el.style.transform = `translate(calc(-50% + ${Math.sin(rad) * r}px), calc(-50% + ${-Math.cos(rad) * r}px))`;
    }

    for (const [id, el] of markers) {
      if (!seen.has(id)) {
        el.remove();
        markers.delete(id);
      }
    }
  };

  return {
    update,
    dispose: () => {
      root.remove();
      markers.clear();
    },
  };
}
