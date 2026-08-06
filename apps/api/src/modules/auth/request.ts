import type { Request } from "express";
import { SESSION_COOKIE } from "./auth.service.js";

export function sessionToken(request: Request): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name === SESSION_COOKIE) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}
