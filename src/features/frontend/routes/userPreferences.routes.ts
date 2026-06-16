import type { Request, Response } from "express";
import { authService } from "../../../services/authService.js";
import { userPreferencesService } from "../userPreferences.service.js";
import type { UserPreferencesService } from "../userPreferences.service.js";

const LOCAL_DEV_PORT = 2001;

type FrontendRouteAction = (
  request: Request,
  response: Response,
) => Promise<void>;

type UserPreferenceRouteService = Pick<
  UserPreferencesService,
  "getPreference" | "savePreference"
>;

type ResolveUserId = (request: Request) => Promise<string | null>;

function effectivePort(): number {
  return Number(
    process.env.PORT ??
      (process.env.NODE_ENV === "production" ? 2000 : LOCAL_DEV_PORT),
  );
}

async function getFrontendUserId(request: Request): Promise<string | null> {
  if (effectivePort() === LOCAL_DEV_PORT) {
    const localUser =
      typeof request.headers["x-user-id"] === "string"
        ? request.headers["x-user-id"].trim()
        : "";
    return localUser || "local-dev";
  }

  const user = await authService.verifyToken(request);
  return user?.userId || null;
}

function decodePreferenceKey(rawKey: unknown): string {
  if (typeof rawKey !== "string" || rawKey.trim() === "") {
    throw new BadRequestError("key is required");
  }

  try {
    const key = decodeURIComponent(rawKey).trim();
    if (!key) {
      throw new BadRequestError("key is required");
    }
    return key;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError("key must be URL encoded");
  }
}

function requireBodyValue(request: Request): unknown {
  const body = request.body;
  if (
    !body ||
    typeof body !== "object" ||
    !Object.prototype.hasOwnProperty.call(body, "value")
  ) {
    throw new BadRequestError("value is required");
  }
  return body.value;
}

function withFrontendToken(
  action: FrontendRouteAction,
  resolveUserId: ResolveUserId,
): FrontendRouteAction {
  return async (request, response) => {
    const ownerUserId = await resolveUserId(request);
    if (!ownerUserId) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    response.locals.frontendUserId = ownerUserId;
    await action(request, response);
  };
}

function createGetUserPreference(service: UserPreferenceRouteService) {
  return async (request: Request, response: Response) => {
    try {
      const key = decodePreferenceKey(request.params.key);
      response.json(
        await service.getPreference({
          ownerUserId: response.locals.frontendUserId,
          key,
        }),
      );
    } catch (error) {
      sendError(response, error);
    }
  };
}

function createSaveUserPreference(service: UserPreferenceRouteService) {
  return async (request: Request, response: Response) => {
    try {
      const key = decodePreferenceKey(request.params.key);
      const value = requireBodyValue(request);
      response.json(
        await service.savePreference({
          ownerUserId: response.locals.frontendUserId,
          key,
          value,
        }),
      );
    } catch (error) {
      sendError(response, error);
    }
  };
}

export function createUserPreferenceRoutes(
  service: UserPreferenceRouteService = userPreferencesService,
  resolveUserId: ResolveUserId = getFrontendUserId,
) {
  return [
    {
      path: "/user-preferences/:key",
      method: "get",
      action: withFrontendToken(createGetUserPreference(service), resolveUserId),
    },
    {
      path: "/user-preferences/:key",
      method: "put",
      action: withFrontendToken(
        createSaveUserPreference(service),
        resolveUserId,
      ),
    },
  ];
}

export const UserPreferenceRoutes = createUserPreferenceRoutes();

class BadRequestError extends Error {}

function sendError(response: Response, error: unknown) {
  if (error instanceof BadRequestError) {
    response.status(400).json({ error: error.message });
    return;
  }

  response.status(500).json({
    error: error instanceof Error ? error.message : String(error),
  });
}
