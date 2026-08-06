import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { loadConfig } from "../../config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class SameOriginGuard implements CanActivate {
  private readonly allowedOrigin = new URL(loadConfig().WEB_ORIGIN).origin;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (request.headers.origin !== this.allowedOrigin) {
      throw new ForbiddenException("Cross-origin request rejected.");
    }
    return true;
  }
}
