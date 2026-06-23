import jwt, { JwtPayload as JsonWebTokenPayload } from "jsonwebtoken";
import { Request } from "express";

const JWT_ISSUER = "jdy-backend";
const AUTH_CLIENT_IDS = ["legacy-frontend", "new-frontend"] as const;

export interface JwtPayload {
  sub?: string;
  userId: string;
  corpId?: string;
  clientId?: string;
  scopes?: string[];
  name: string | null | undefined;
  avatar: string | null | undefined;
}

export interface AuthenticatedUser extends JwtPayload {
  sub: string;
  corpId: string;
  clientId: string;
  scopes: string[];
  iat?: number;
  exp?: number;
}

const jwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return "development-only-jwt-secret";
};

export const validateAuthSecrets = (): void => {
  jwtSecret();
};

const normalizePayload = (payload: JwtPayload): AuthenticatedUser => ({
  ...payload,
  sub: payload.sub ?? payload.userId,
  corpId: payload.corpId ?? "",
  clientId: payload.clientId ?? "legacy-frontend",
  scopes: payload.scopes ?? [],
});

export const generateToken = (payload: JwtPayload): string => {
  const normalized = normalizePayload(payload);
  return jwt.sign(normalized, jwtSecret(), {
    expiresIn: "30m",
    issuer: JWT_ISSUER,
    audience: normalized.clientId,
  });
};

export const verifyToken = (
  token: string | null,
  expectedClientIds: readonly string[] = AUTH_CLIENT_IDS
): AuthenticatedUser => {
  if (!token) {
    return normalizePayload({ userId: "", name: "", avatar: "" });
  }
  if (!expectedClientIds.length) throw new Error("Expected audience is required");

  try {
    const decoded = jwt.verify(token, jwtSecret(), {
      issuer: JWT_ISSUER,
      audience: expectedClientIds as [string, ...string[]],
    }) as unknown as JsonWebTokenPayload & JwtPayload;
    return normalizePayload(decoded);
  } catch (error) {
    // Tokens issued before the multi-client migration had no issuer/audience.
    const legacy = jwt.verify(token, jwtSecret()) as JsonWebTokenPayload & JwtPayload;
    if (legacy.iss || legacy.aud) throw error;
    return normalizePayload(legacy);
  }
};

export const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim() || null;
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== "auth_token") continue;
    const value = item.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return value || null;
    }
  }
  return null;
};

export const generateJdyToken = (userid, redirect_uri?: string) => {
  const secret = process.env.JDYSSO_SECRET || "";
  return jwt.sign(
    { type: "sso_res", username: userid, redirect_uri },
    secret,
    { algorithm: "HS256", expiresIn: 60000, audience: "com.jiandaoyun" }
  );
};

export const verifyJdyToken = (request: string | null) => {
  if (!request) return true;
  const secret = process.env.JDYSSO_SECRET || "";
  const decoded = jwt.verify(request, secret, {
    algorithms: ["HS256", "HS384", "HS512"],
    issuer: "com.jiandaoyun",
    clockTolerance: 3600,
  });
  if (decoded?.["type"] !== "sso_req") return false;
  return true;
};
