import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService, InvalidCredentialsError, LoginRateLimitError } from "./auth.service.js";
import { LoginRateLimiter } from "./login-rate-limiter.js";
import type { SessionStore, StoredSession } from "./session-store.js";

const now = new Date("2026-08-05T12:00:00.000Z");

describe("AuthService", () => {
  let records: Array<StoredSession & { tokenHash: string; revoked: boolean }>;
  let store: SessionStore;
  let auth: AuthService;

  beforeEach(() => {
    process.env.AUTH_LOGIN_MAX_ATTEMPTS = "2";
    process.env.AUTH_SESSION_TTL_HOURS = "24";
    records = [];
    store = {
      create: vi.fn(async (tokenHash: string, expiresAt: Date) => {
        const session = { id: crypto.randomUUID(), tokenHash, expiresAt, revoked: false };
        records.push(session);
        return { id: session.id, expiresAt };
      }),
      findActive: vi.fn(async (tokenHash: string, at: Date) => {
        const session = records.find(
          (entry) => entry.tokenHash === tokenHash && !entry.revoked && entry.expiresAt > at,
        );
        return session ? { id: session.id, expiresAt: session.expiresAt } : null;
      }),
      revoke: vi.fn(async (tokenHash: string) => {
        const session = records.find((entry) => entry.tokenHash === tokenHash);
        if (session) session.revoked = true;
      }),
      deleteExpired: vi.fn(async () => undefined),
    } as unknown as SessionStore;
    auth = new AuthService(store, new LoginRateLimiter());
  });

  it("creates a hashed, expiring session for the configured owner", async () => {
    const result = await auth.login("owner", "correct horse battery staple", "127.0.0.1", now);

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(records[0]?.tokenHash).not.toBe(result.token);
    expect(result.session).toMatchObject({
      username: "owner",
      expiresAt: new Date("2026-08-06T12:00:00.000Z"),
    });
    await expect(auth.authenticate(result.token, now)).resolves.toMatchObject({
      username: "owner",
    });
  });

  it("rejects invalid credentials and rate-limits repeated failures", async () => {
    await expect(auth.login("owner", "wrong", "client", now)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    await expect(auth.login("owner", "wrong", "client", now)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    await expect(auth.login("owner", "wrong", "client", now)).rejects.toBeInstanceOf(
      LoginRateLimitError,
    );
  });

  it("rejects expired sessions and revokes active sessions on logout", async () => {
    const { token } = await auth.login("owner", "correct horse battery staple", "client", now);
    await expect(
      auth.authenticate(token, new Date("2026-08-06T12:00:00.001Z")),
    ).resolves.toBeNull();

    await auth.logout(token, now);
    await expect(auth.authenticate(token, now)).resolves.toBeNull();
    expect(store.revoke).toHaveBeenCalledOnce();
  });

  it("uses hardened cookie attributes and clears with the same scope", () => {
    expect(auth.cookieOptions(now)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/api",
      expires: now,
    });
    expect(auth.cookieOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/api",
    });

    process.env.NODE_ENV = "production";
    const productionAuth = new AuthService(store, new LoginRateLimiter());
    expect(productionAuth.cookieOptions()).toMatchObject({ secure: true, httpOnly: true });
    process.env.NODE_ENV = "test";
  });
});
