import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { databaseProviders } from "../../database.provider.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { LoginRateLimiter } from "./login-rate-limiter.js";
import { SameOriginGuard } from "./same-origin.guard.js";
import { SessionStore } from "./session-store.js";

@Module({
  controllers: [AuthController],
  providers: [
    ...databaseProviders,
    SessionStore,
    LoginRateLimiter,
    AuthService,
    { provide: APP_GUARD, useClass: SameOriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
