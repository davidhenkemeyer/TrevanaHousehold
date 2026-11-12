import type { Tokens } from "@tenara/contracts";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/http";
import { SessionManager, type SessionStorage, type StoredSession, persistable } from "./session";

const tokens = (n: number): Tokens => ({
  accessToken: `access-${n}`,
  accessTokenExpiresAt: "2026-11-10T12:15:00.000Z",
  refreshToken: `refresh-${n}`,
  refreshTokenExpiresAt: "2027-01-09T12:00:00.000Z",
});

const session: StoredSession = {
  user: { id: "u1", email: null, displayName: "Billy", avatarColor: "#2563EB" },
  tokens: tokens(1),
};

function memoryStorage(
  initial: StoredSession | null = null,
): SessionStorage & { value: StoredSession | null } {
  const store = {
    value: initial,
    load: async () => store.value,
    save: async (s: StoredSession) => {
      store.value = s;
    },
    clear: async () => {
      store.value = null;
    },
  };
  return store;
}

describe("SessionManager", () => {
  it("restores a saved session on start-up", async () => {
    const manager = new SessionManager(memoryStorage(session), vi.fn());
    await manager.init();
    expect(manager.isLoaded).toBe(true);
    expect(manager.accessToken()).toBe("access-1");
  });

  it("shares one refresh between concurrent callers (refresh tokens are single-use)", async () => {
    const storage = memoryStorage(session);
    const refresh = vi.fn(async () => tokens(2));
    const manager = new SessionManager(storage, refresh);
    await manager.init();

    const results = await Promise.all([
      manager.refreshAccessToken(),
      manager.refreshAccessToken(),
      manager.refreshAccessToken(),
    ]);
    expect(results).toEqual(["access-2", "access-2", "access-2"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith("refresh-1");
    expect(storage.value?.tokens.refreshToken).toBe("refresh-2");
  });

  it("signs out when the refresh token is rejected", async () => {
    const storage = memoryStorage(session);
    const manager = new SessionManager(storage, async () => {
      throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Your session has ended.");
    });
    await manager.init();
    const onChange = vi.fn();
    manager.subscribe(onChange);

    await expect(manager.refreshAccessToken()).resolves.toBeNull();
    expect(manager.current).toBeNull();
    expect(storage.value).toBeNull();
    expect(onChange).toHaveBeenCalled();
  });

  it("stays signed in when the refresh fails for network reasons", async () => {
    const manager = new SessionManager(memoryStorage(session), async () => {
      throw new ApiError(0, "NETWORK_ERROR", "offline");
    });
    await manager.init();
    await expect(manager.refreshAccessToken()).resolves.toBeNull();
    expect(manager.current).not.toBeNull();
  });

  it("starts a new session when users switch", async () => {
    const storage = memoryStorage(session);
    const manager = new SessionManager(storage, vi.fn());
    await manager.init();
    await manager.start({
      user: { id: "u2", email: null, displayName: "Sally", avatarColor: "#DB2777" },
      tokens: tokens(9),
    });
    expect(manager.current?.user.displayName).toBe("Sally");
    expect(storage.value?.tokens.accessToken).toBe("access-9");
  });
});

describe("what a device may save", () => {
  it("keeps everything on phones (the OS keychain)", () => {
    expect(persistable(session, false)).toEqual(session);
  });

  it("saves no tokens on the web (refresh is a cookie, access stays in memory)", () => {
    const saved = persistable(session, true);
    expect(saved.user).toEqual(session.user);
    expect(saved.tokens.accessToken).toBe("");
    expect(saved.tokens).not.toHaveProperty("refreshToken");
    expect(JSON.stringify(saved)).not.toContain("refresh-1");
    expect(JSON.stringify(saved)).not.toContain("access-1");
  });

  it("refreshes through the cookie after a web reload", async () => {
    const storage = memoryStorage(persistable(session, true));
    const refresh = vi.fn(async (_token: string | undefined) => {
      const { refreshToken: _r, ...fresh } = tokens(2);
      return fresh;
    });
    const manager = new SessionManager(storage, refresh);
    await manager.init();
    expect(manager.accessToken()).toBe("");
    expect(await manager.refreshAccessToken()).toBe("access-2");
    expect(refresh).toHaveBeenCalledWith(undefined);
  });
});
