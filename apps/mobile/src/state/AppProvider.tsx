/**
 * App-wide state: the API client, the signed-in session, this device's mode
 * (personal or shared), and the current family. Screens use the hooks below.
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { AuthResponse, Member, MeResponse } from "@titan/contracts";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Platform } from "react-native";
import { type Api, createApi } from "../api/endpoints";
import { createHttpClient } from "../api/http";
import { SessionManager, type StoredSession } from "../auth/session";
import { type DeviceMode, deviceSettings, sessionStorage } from "../auth/storage";
import { apiBaseUrl } from "../config";

interface AppContextValue {
  api: Api;
  manager: SessionManager;
  deviceMode: DeviceMode;
  setDeviceMode: (mode: DeviceMode) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * The session manager and the API client need each other (the client asks the
 * manager for tokens; the manager refreshes through the client), so the client
 * is handed to the manager through a holder once it exists.
 */
function createServices() {
  const holder: { api?: Api } = {};
  const manager = new SessionManager(sessionStorage, (refreshToken) => {
    if (!holder.api) throw new Error("API not ready");
    return holder.api.refresh(refreshToken);
  });
  const api = createApi(
    createHttpClient({
      baseUrl: apiBaseUrl(),
      getAccessToken: () => manager.accessToken(),
      refreshAccessToken: () => manager.refreshAccessToken(),
      browser: Platform.OS === "web",
    }),
  );
  holder.api = api;
  return { api, manager };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [{ api, manager }] = useState(createServices);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }),
  );
  const [deviceMode, setMode] = useState<DeviceMode>("personal");

  useEffect(() => {
    void manager.init();
    void deviceSettings.mode().then(setMode);
  }, [manager]);

  // A different person means different data: drop everything cached for the
  // last one. (Token refreshes also notify, but keep the same user.)
  useEffect(() => {
    let userId = manager.current?.user.id;
    return manager.subscribe(() => {
      const next = manager.current?.user.id;
      if (next !== userId) {
        userId = next;
        queryClient.clear();
      }
    });
  }, [manager, queryClient]);

  const setDeviceMode = useCallback(async (mode: DeviceMode) => {
    await deviceSettings.setMode(mode);
    setMode(mode);
  }, []);

  const value = useMemo(
    () => ({ api, manager, deviceMode, setDeviceMode }),
    [api, manager, deviceMode, setDeviceMode],
  );
  return (
    <AppContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AppContext.Provider>
  );
}

function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export function useApi(): Api {
  return useApp().api;
}

export function useDeviceMode() {
  const { deviceMode, setDeviceMode } = useApp();
  return { deviceMode, setDeviceMode };
}

/** The signed-in session (or null), re-rendering when it changes. */
export function useSession(): {
  session: StoredSession | null;
  loaded: boolean;
  start: (auth: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
} {
  const { api, manager } = useApp();
  const snapshot = useSyncExternalStore(
    (cb) => manager.subscribe(cb),
    () => manager.current,
    () => manager.current,
  );
  const loaded = useSyncExternalStore(
    (cb) => manager.subscribe(cb),
    () => manager.isLoaded,
    () => manager.isLoaded,
  );
  const start = useCallback((auth: AuthResponse) => manager.start(auth), [manager]);
  const signOut = useCallback(async () => {
    const refreshToken = manager.current?.tokens.refreshToken;
    await manager.signOut();
    // Best effort: also end the session on the server.
    // (On the web there's no token here; the API reads the cookie and clears it.)
    await api.logout(refreshToken).catch(() => undefined);
  }, [api, manager]);
  return { session: snapshot, loaded, start, signOut };
}

export function useMe() {
  const api = useApi();
  const { session } = useSession();
  return useQuery<MeResponse>({
    queryKey: ["me", session?.user.id],
    queryFn: () => api.me(),
    enabled: session !== null,
  });
}

/**
 * The family this device is working with (the first one the user belongs to;
 * choosing between several families can come later), and the user's own
 * membership in it.
 */
export function useFamily() {
  const api = useApi();
  const me = useMe();
  const membership = me.data?.memberships[0];
  const family = useQuery({
    queryKey: ["family", membership?.familyId],
    queryFn: () => api.family(membership!.familyId),
    enabled: membership !== undefined,
  });
  const self: Member | undefined = family.data?.members.find(
    (m) => m.id === membership?.membershipId,
  );
  return {
    me,
    familyId: membership?.familyId,
    membershipId: membership?.membershipId,
    role: membership?.role,
    family,
    self,
  };
}
