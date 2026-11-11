/**
 * Keeps this phone's push registration in step with who's signed in:
 *   - a personal phone registers for the signed-in person (asking permission once);
 *   - a shared family device never receives pushes (the family's choice), so
 *     turning shared mode on unregisters it.
 * Also opens the right screen when a push is tapped. Does nothing on the web.
 */
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useApi, useDeviceMode, useFamily, useSession } from "../../state/AppProvider";
import { onNotificationTap, registerForPush, unregisterPush } from "./push";

export function usePushRegistration(): void {
  const api = useApi();
  const router = useRouter();
  const { session } = useSession();
  const { deviceMode } = useDeviceMode();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    // Best effort: push is a convenience; the inbox always has everything.
    const run = deviceMode === "shared" ? unregisterPush(api) : registerForPush(api);
    void run.catch(() => undefined);
  }, [api, userId, deviceMode]);

  useEffect(
    () =>
      onNotificationTap((data) => {
        if (typeof data.instanceId === "string") {
          router.push({ pathname: "/chore/[id]", params: { id: data.instanceId } });
        } else if (typeof data.redemptionId === "string") {
          router.push("/review");
        } else {
          router.push("/notifications");
        }
      }),
    [router],
  );
}

/** The signed-in person's unread notifications (for badges and the Me tab). */
export function useUnreadCount(): number {
  const api = useApi();
  const { familyId } = useFamily();
  const inbox = useQuery({
    queryKey: ["notifications", familyId],
    queryFn: () => api.inbox(familyId!),
    enabled: familyId !== undefined,
    refetchInterval: 60_000,
  });
  return inbox.data?.unreadCount ?? 0;
}
