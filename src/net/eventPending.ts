import type { EventRequest, EventResult } from "../sim/events";

let pendingId = 0;
const pending = new Map<number, (result: EventResult) => void>();

export function trackEventResult(id: number, resolve: (result: EventResult) => void) {
  pending.set(id, resolve);
}

export function resolveEventResult(id: number, result: EventResult) {
  const cb = pending.get(id);
  if (cb) {
    pending.delete(id);
    cb(result);
  }
}

export function nextEventId(): number {
  pendingId += 1;
  return pendingId;
}

export async function requestWithTimeout(
  send: (req: EventRequest, id: number) => void,
  req: EventRequest,
  ms = 5000,
): Promise<EventResult> {
  const id = nextEventId();
  return new Promise((resolve) => {
    trackEventResult(id, resolve);
    send(req, id);
    setTimeout(() => resolve({ ok: false, error: "timeout" }), ms);
  });
}
