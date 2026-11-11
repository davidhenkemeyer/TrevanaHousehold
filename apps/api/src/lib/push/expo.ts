/**
 * PushSender on Expo's push service, which forwards to Apple (APNs) and
 * Google (FCM). Messages go out in Expo's chunk sizes; an error ticket of
 * DeviceNotRegistered (or a malformed token) marks the token for removal.
 *
 * Later work: Expo also issues delivery receipts after a while, which can
 * report more dead tokens; this checks tickets only.
 */
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import type { PushMessage, PushResult, PushSender } from "./types.js";

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
              ? { to, ok: true, unregistered: false }
              : { to, ok: false, unregistered: ticket.details?.error === "DeviceNotRegistered" },
          );
        });
        offset += chunk.length;
      }
      return results;
    },
  };
}
