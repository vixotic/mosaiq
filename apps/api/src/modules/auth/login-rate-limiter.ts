import { Injectable } from "@nestjs/common";
import { loadConfig } from "../../config.js";

type AttemptWindow = { failures: number; resetAt: number };

@Injectable()
export class LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptWindow>();
  private readonly config = loadConfig();

  check(key: string, now = Date.now()): number | null {
    const attempt = this.attempts.get(key);
    if (!attempt || attempt.resetAt <= now) {
      this.attempts.delete(key);
      return null;
    }
    return attempt.failures >= this.config.AUTH_LOGIN_MAX_ATTEMPTS
      ? Math.ceil((attempt.resetAt - now) / 1000)
      : null;
  }

  recordFailure(key: string, now = Date.now()): void {
    const existing = this.attempts.get(key);
    const resetAt = now + this.config.AUTH_LOGIN_WINDOW_MINUTES * 60_000;
    this.attempts.set(
      key,
      existing && existing.resetAt > now
        ? { ...existing, failures: existing.failures + 1 }
        : { failures: 1, resetAt },
    );
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
