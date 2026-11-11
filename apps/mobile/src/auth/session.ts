/**
 * The signed-in session on this device: who is using it, and their tokens.
 *
 * Plain TypeScript (no React) so it can be unit-tested; SessionProvider wraps
 * it for screens. Concurrent requests that hit an expired access token share
 * one refresh ("single flight") instead of each burning a refresh token, which
 * the API would treat as theft (refresh tokens are single-use).
 */
import type { AuthResponse, Tokens, User } from "@titan/contracts";
import { ApiError } from "../api/http";

export interface StoredSession {
  user: User;
  tokens: Tokens;
}

export interface SessionStorage {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

/**
 * What may be saved on this device. On the web, nothing secret: storage there
 * is readable by any script on the page. The refresh token is an httpOnly
 * cookie and the access token stays in memory, so after a reload the first
 * request refreshes through the cookie.
 */
export function persistable(session: StoredSession, web: boolean): StoredSession {
  if (!web) return session;
  const { refreshToken: _cookie, ...tokens } = session.tokens;
  return { user: session.user, tokens: { ...tokens, accessToken: "" } };
}

export class SessionManager {
  private session: StoredSession | null = null;
  private loaded = false;
  private refreshing: Promise<string | null> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: SessionStorage,
    /** Native apps pass their stored token; on the web it's undefined (the cookie is used). */
    private readonly refreshTokens: (refreshToken: string | undefined) => Promise<Tokens>,
  ) {}

  async init(): Promise<void> {
    try {
      this.session = await this.storage.load();
    } catch {
      this.session = null; // unreadable storage: start signed out
    }
    this.loaded = true;
    this.emit();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  get current(): StoredSession | null {
    return this.session;
  }

  accessToken(): string | null {
    return this.session?.tokens.accessToken ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** After sign-in, sign-up, pairing, or switching users. */
  async start(auth: AuthResponse): Promise<void> {
    await this.set({ user: auth.user, tokens: auth.tokens });
  }

  async signOut(): Promise<void> {
    this.session = null;
    await this.storage.clear();
    this.emit();
  }

  /** Returns a fresh access token, or null if the session is over (it then signs out). */
  refreshAccessToken(): Promise<string | null> {
    const current = this.session;
    if (!current) return Promise.resolve(null);
    this.refreshing ??= (async () => {
      try {
        const tokens = await this.refreshTokens(current.tokens.refreshToken);
        await this.set({ ...current, tokens });
        return tokens.accessToken;
      } catch (error) {
        // A rejected refresh token means the session really ended. A network
        // problem doesn't: keep the session and let the user retry.
        if (error instanceof ApiError && error.status === 401) await this.signOut();
        return null;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async set(session: StoredSession): Promise<void> {
    this.session = session;
    await this.storage.save(session);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
