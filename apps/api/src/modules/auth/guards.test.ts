import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { AuthGuard } from "./auth.guard.js";
import type { AuthService } from "./auth.service.js";
import { SameOriginGuard } from "./same-origin.guard.js";

function context(request: { method: string; headers: Record<string, string> }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe("authentication guards", () => {
  it("protects private routes without a valid session", async () => {
    const auth = { authenticate: vi.fn(async () => null) } as unknown as AuthService;
    const guard = new AuthGuard(new Reflector(), auth);
    await expect(guard.canActivate(context({ method: "GET", headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("allows a valid session cookie through to private routes", async () => {
    const auth = {
      authenticate: vi.fn(async () => ({
        id: "session",
        username: "owner",
        expiresAt: new Date(),
      })),
    } as unknown as AuthService;
    const guard = new AuthGuard(new Reflector(), auth);
    await expect(
      guard.canActivate(
        context({ method: "GET", headers: { cookie: "other=x; mosaiq_session=secret" } }),
      ),
    ).resolves.toBe(true);
    expect(auth.authenticate).toHaveBeenCalledWith("secret");
  });

  it("rejects authenticated mutations from a foreign or missing origin", () => {
    const guard = new SameOriginGuard();
    expect(() => guard.canActivate(context({ method: "POST", headers: {} }))).toThrow(
      ForbiddenException,
    );
    expect(() =>
      guard.canActivate({
        ...context({ method: "PATCH", headers: { origin: "https://attacker.example" } }),
      }),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        context({ method: "DELETE", headers: { origin: "http://127.0.0.1:5173" } }),
      ),
    ).toBe(true);
  });
});
