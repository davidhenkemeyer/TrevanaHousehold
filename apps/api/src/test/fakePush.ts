/** In-memory PushSender for tests: records what would have been sent. */
import type { PushMessage, PushSender } from "../lib/push/types.js";

export interface FakePush extends PushSender {
  sent: PushMessage[];
  /** Tokens to report as no longer registered. */
  dead: Set<string>;
}

export function createFakePush(): FakePush {
  const sent: PushMessage[] = [];
  const dead = new Set<string>();
  return {
    sent,
    dead,
    send(messages) {
      return Promise.resolve(
        messages.map((m) => {
          if (dead.has(m.to)) return { to: m.to, ok: false, unregistered: true };
          sent.push(m);
          return { to: m.to, ok: true, unregistered: false };
        }),
      );
    },
  };
}
