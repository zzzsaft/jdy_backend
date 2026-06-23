import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { CorsOptions } from "cors";
import { getWechatAuthAllowedOrigins } from "../features/wechat/wechatCorps.js";
import { generateToken, verifyToken } from "../utils/jwt.js";

export const AUTH_COOKIE_NAME = "auth_token";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 30 * 60;
export const AUTH_ROTATION_WINDOW_SECONDS = 10 * 60;

const cookieAttributes = [
  "HttpOnly",
  "Secure",
  "SameSite=Lax",
  "Path=/",
];

export const serializeAuthCookie = (token: string): string =>
  `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttributes.join("; ")}; Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`;

export const serializeClearedAuthCookie = (): string =>
  `${AUTH_COOKIE_NAME}=; ${cookieAttributes.join("; ")}; Max-Age=0`;

export const setAuthCookie = (response: Response, token: string): void => {
  response.setHeader("Set-Cookie", serializeAuthCookie(token));
  response.setHeader("Cache-Control", "no-store");
};

export const clearAuthCookie = (response: Response): void => {
  response.setHeader("Set-Cookie", serializeClearedAuthCookie());
  response.setHeader("Cache-Control", "no-store");
};

const readAuthCookie = (request: Request): string | null => {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== AUTH_COOKIE_NAME) continue;
    const value = item.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return value || null;
    }
  }
  return null;
};

const hasBearerToken = (request: Request): boolean =>
  request.headers.authorization?.startsWith("Bearer ") === true;

type AllowedOriginsProvider = () => readonly string[];

const requestOrigin = (request: Request): string | null => {
  if (typeof request.headers.origin === "string") return request.headers.origin;
  if (typeof request.headers.referer !== "string") return null;
  try {
    return new URL(request.headers.referer).origin;
  } catch {
    return null;
  }
};

export const createBrowserAuthMiddleware = (
  getAllowedOrigins: AllowedOriginsProvider = getWechatAuthAllowedOrigins,
): RequestHandler => (request: Request, response: Response, next: NextFunction) => {
  if (hasBearerToken(request)) {
    next();
    return;
  }

  const cookieToken = readAuthCookie(request);
  if (!cookieToken) {
    next();
    return;
  }

  const method = request.method.toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const origin = requestOrigin(request);
    if (!origin || !new Set(getAllowedOrigins()).has(origin)) {
      response.status(403).json({ error: "CSRF_REJECTED" });
      return;
    }
  }

  try {
    const user = verifyToken(cookieToken);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!user.exp || user.exp - nowSeconds < AUTH_ROTATION_WINDOW_SECONDS) {
      const rotatedToken = generateToken({
        userId: user.userId,
        corpId: user.corpId,
        clientId: user.clientId,
        scopes: user.scopes,
        name: user.name,
        avatar: user.avatar,
      });
      setAuthCookie(response, rotatedToken);
    }
  } catch {
    // Protected route actions produce the existing 401 behavior for invalid tokens.
  }
  next();
};

export const browserAuthMiddleware = createBrowserAuthMiddleware();

export const browserCorsOptions = (
  getAllowedOrigins: AllowedOriginsProvider = getWechatAuthAllowedOrigins,
): CorsOptions => ({
  credentials: true,
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    callback(null, new Set(getAllowedOrigins()).has(origin));
  },
});
