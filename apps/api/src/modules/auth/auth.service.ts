import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { verify } from "argon2";
import { loadConfig } from "../../config.js";
import { LoginRateLimiter } from "./login-rate-limiter.js";
import { SessionStore, type StoredSession } from "./session-store.js";

export const SESSION_COOKIE = "mosaiq_session";

export type OwnerSession = StoredSession & { username: string };

@Injectable()
export class AuthService {
  private readonly config = loadConfig();

  constructor(
    @Inject(SessionStore) private readonly sessions: SessionStore,
    @Inject(LoginRateLimiter) private readonly rateLimiter: LoginRateLimiter,
  ) {}

  async login(
    username: string,
    password: string,
    clientKey: string,
    now = new Date(),
  ): Promise<{ token: string; session: OwnerSession }> {
    const rateLimitKey = clientKey;
    const retryAfter = this.rateLimiter.check(rateLimitKey, now.getTime());
    if (retryAfter !== null) throw new LoginRateLimitError(retryAfter);

    const usernameMatches = username === this.config.AUTH_OWNER_USERNAME;
    const passwordMatches = await verify(this.config.AUTH_OWNER_PASSWORD_HASH, password).catch(
      () => false,
    );
    if (!usernameMatches || !passwordMatches) {
      this.rateLimiter.recordFailure(rateLimitKey, now.getTime());
      throw new InvalidCredentialsError();
    }

    this.rateLimiter.reset(rateLimitKey);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + this.config.AUTH_SESSION_TTL_HOURS * 3_600_000);
    const stored = await this.sessions.create(this.hashToken(token), expiresAt);
    void this.sessions.deleteExpired(now).catch(() => undefined);
    return { token, session: { ...stored, username: this.config.AUTH_OWNER_USERNAME } };
  }

  async authenticate(token: string | undefined, now = new Date()): Promise<OwnerSession | null> {
    if (!token) return null;
    const session = await this.sessions.findActive(this.hashToken(token), now);
    return session ? { ...session, username: this.config.AUTH_OWNER_USERNAME } : null;
  }

  async logout(token: string | undefined, now = new Date()): Promise<void> {
    if (token) await this.sessions.revoke(this.hashToken(token), now);
  }

  cookieOptions(expiresAt?: Date) {
    return {
      httpOnly: true,
      secure: this.config.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/api",
      ...(expiresAt ? { expires: expiresAt } : {}),
    };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}

export class InvalidCredentialsError extends Error {}
export class LoginRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many login attempts.");
  }
}
