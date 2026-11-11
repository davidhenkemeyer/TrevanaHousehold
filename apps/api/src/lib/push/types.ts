/**
 * Push delivery, behind an interface so jobs stay testable: the real one uses
 * Expo's push service (expo.ts), tests use an in-memory fake (test/fakePush.ts).
 * Pushes are only ever sent from background jobs, never inside a request.
 */
export interface PushMessage {
  /** An Expo push token. */
  to: string;
  title: string;
  body: string;
  /** Read by the app when the notification is tapped. */
  data?: Record<string, unknown>;
}

export interface PushResult {
  to: string;
  ok: boolean;
  /** The token no longer works (app uninstalled, token revoked): forget it. */
  unregistered: boolean;
}

export interface PushSender {
  send(messages: readonly PushMessage[]): Promise<PushResult[]>;
}
