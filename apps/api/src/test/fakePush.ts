/** In-memory PushSender for tests: records what would have been sent. */
import type { PushMessage, PushReceipt, PushSender } from "../lib/push/types.js";

export interface FakePush extends PushSender {
  sent: PushMessage[];
  /** Tokens to report as no longer registered (right away, at send time). */
  dead: Set<string>;
  /** Receipts the service will report, by ticket id (set by tests). */
  receiptsById: Map<string, PushReceipt>;
  /** Ticket ids asked about, one list per request. */
  receiptRequests: string[][];
}

export function createFakePush(): FakePush {
  const sent: PushMessage[] = [];
  const dead = new Set<string>();
  const receiptsById = new Map<string, PushReceipt>();
  const receiptRequests: string[][] = [];
  return {
    sent,
    dead,
    receiptsById,
    receiptRequests,
    send(messages) {
      return Promise.resolve(
        messages.map((m) => {
          if (dead.has(m.to)) return { to: m.to, ok: false, unregistered: true };
          sent.push(m);
          // Predictable ticket ids for tests: "ticket-<n>", in send order.
          return { to: m.to, ok: true, unregistered: false, ticketId: `ticket-${sent.length}` };
        }),
      );
    },
    receipts(ticketIds) {
      receiptRequests.push([...ticketIds]);
      const out: Record<string, PushReceipt> = {};
      for (const id of ticketIds) {
        const receipt = receiptsById.get(id);
        if (receipt) out[id] = receipt;
      }
      return Promise.resolve(out);
    },
  };
}
