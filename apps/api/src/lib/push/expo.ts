/**
 * PushSender on Expo's push service, which forwards to Apple (APNs) and
 * Google (FCM). Messages go out in Expo's chunk sizes; an error ticket of
 * DeviceNotRegistered (or a malformed token) marks the token for removal.
 *
 * Delivery receipts (`receipts`) are fetched later by a job: they can report
 * dead tokens that the immediate ticket didn't know about.
 */
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import type { PushMessage, PushReceipt, PushResult, PushSender } from "./types.js";

export function createExpoPush(accessToken?: string): PushSender {
  const expo = new Expo(accessToken ? { accessToken } : {});
  return {
    async send(messages) {
      const results: PushResult[] = [];
      const valid: PushMessage[] = [];
      for (const m of messages) {
        if (Expo.isExpoPushToken(m.to)) valid.push(m);
        else results.push({ to: m.to, ok: false, unregistered: true });
      }
      const expoMessages: ExpoPushMessage[] = valid.map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        sound: "default",
        ...(m.data && { data: m.data }),
      }));
      let offset = 0;
      for (const chunk of expo.chunkPushNotifications(expoMessages)) {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, i) => {
          const to = valid[offset + i]?.to ?? "";
          results.push(
            ticket.status === "ok"
              ? { to, ok: true, unregistered: false, ticketId: ticket.id }
              : { to, ok: false, unregistered: ticket.details?.error === "DeviceNotRegistered" },
          );
        });
        offset += chunk.length;
      }
      return results;
    },

    async receipts(ticketIds) {
      const out: Record<string, PushReceipt> = {};
      for (const chunk of expo.chunkPushNotificationReceiptIds([...ticketIds])) {
        const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
        for (const [id, receipt] of Object.entries(receipts)) {
          out[id] =
            receipt.status === "ok"
              ? { ok: true, unregistered: false }
              : { ok: false, unregistered: receipt.details?.error === "DeviceNotRegistered" };
        }
      }
      return out;
    },
  };
}
