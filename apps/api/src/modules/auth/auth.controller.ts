import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  AuthService,
  InvalidCredentialsError,
  LoginRateLimitError,
  SESSION_COOKIE,
} from "./auth.service.js";
import { Public } from "./public.decorator.js";
import { sessionToken } from "./request.js";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(1_000),
});

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @Public()
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new UnauthorizedException("Invalid username or password.");
    try {
      const { token, session } = await this.auth.login(
        parsed.data.username,
        parsed.data.password,
        request.ip || request.socket.remoteAddress || "unknown",
      );
      response.cookie(SESSION_COOKIE, token, this.auth.cookieOptions(session.expiresAt));
      return {
        authenticated: true,
        owner: { username: session.username },
        expiresAt: session.expiresAt,
      };
    } catch (error) {
      if (error instanceof LoginRateLimitError) {
        response.setHeader("Retry-After", String(error.retryAfterSeconds));
        throw new HttpException("Too many login attempts. Try again later.", 429);
      }
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException("Invalid username or password.");
      }
      throw error;
    }
  }

  @Get("session")
  @Public()
  async current(@Req() request: Request) {
    const session = await this.auth.authenticate(sessionToken(request));
    return session
      ? { authenticated: true, owner: { username: session.username }, expiresAt: session.expiresAt }
      : { authenticated: false };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(sessionToken(request));
    response.clearCookie(SESSION_COOKIE, this.auth.cookieOptions());
  }
}
