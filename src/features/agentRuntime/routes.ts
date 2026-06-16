import type { Request, Response } from "express";
import { authService } from "../../services/authService.js";
import { agentRuntimeService } from "./defaultRuntime.js";

const LOCAL_DEV_PORT = 2001;

type AgentRuntimeRouteAction = (
  request: Request,
  response: Response,
) => Promise<void>;

function effectivePort(): number {
  return Number(process.env.PORT ?? (process.env.NODE_ENV === "production" ? 2000 : LOCAL_DEV_PORT));
}

async function requireAgentRuntimeToken(
  request: Request,
  response: Response,
): Promise<boolean> {
  if (effectivePort() === LOCAL_DEV_PORT) {
    return true;
  }
  const user = await authService.verifyToken(request);
  if (!user?.userId) {
    response.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function withAgentRuntimeToken(action: AgentRuntimeRouteAction): AgentRuntimeRouteAction {
  return async (request, response) => {
    if (!(await requireAgentRuntimeToken(request, response))) {
      return;
    }
    await action(request, response);
  };
}

async function getAgentRuntimeUserId(request: Request): Promise<string | null> {
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

const createSession = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.createSession({
        agentType: optionalString(request.body?.agentType) ?? undefined,
        ownerUserId: await getAgentRuntimeUserId(request),
        title: optionalString(request.body?.title),
        metadata:
          request.body?.metadata && typeof request.body.metadata === "object"
            ? request.body.metadata
            : {},
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const listSessions = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.listSessions({
        ownerUserId: await getAgentRuntimeUserId(request),
        agentType:
          typeof request.query.agentType === "string" &&
          request.query.agentType.trim()
            ? request.query.agentType.trim()
            : undefined,
        status:
          typeof request.query.status === "string" && request.query.status.trim()
            ? request.query.status.trim()
            : undefined,
        page:
          typeof request.query.page === "string"
            ? Number(request.query.page)
            : undefined,
        pageSize:
          typeof request.query.pageSize === "string"
            ? Number(request.query.pageSize)
            : undefined,
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const updateSession = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.updateSession({
        sessionId: requireString(request.params.sessionId, "sessionId"),
        ownerUserId: await getAgentRuntimeUserId(request),
        title:
          request.body?.title === undefined
            ? undefined
            : optionalString(request.body.title) ?? null,
        status: optionalString(request.body?.status) ?? undefined,
        agentType: optionalString(request.body?.agentType) ?? undefined,
        metadata:
          request.body?.metadata === undefined
            ? undefined
            : request.body?.metadata && typeof request.body.metadata === "object"
              ? request.body.metadata
              : {},
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const runAgent = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.run({
        sessionId: optionalString(request.body?.sessionId) ?? undefined,
        agentType: optionalString(request.body?.agentType) ?? undefined,
        message: requireString(request.body?.message, "message"),
        confirmed: request.body?.confirmed === true,
        referenceConfigId:
          optionalString(request.body?.referenceConfigId) ?? undefined,
        llmModel: optionalString(request.body?.llmModel) ?? undefined,
        context:
          request.body?.context && typeof request.body.context === "object"
            ? request.body.context
            : undefined,
        ownerUserId: await getAgentRuntimeUserId(request),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getSession = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.getSessionDetail({
        sessionId: requireString(request.params.sessionId, "sessionId"),
        ownerUserId: await getAgentRuntimeUserId(request),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getRun = async (request: Request, response: Response) => {
  try {
    response.json(
      await agentRuntimeService.getRunDetail({
        runId: requireString(request.params.runId, "runId"),
        ownerUserId: await getAgentRuntimeUserId(request),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

export const AgentRuntimeRoutes = [
  {
    path: "/agentRuntime/sessions",
    method: "get",
    action: withAgentRuntimeToken(listSessions),
  },
  {
    path: "/agentRuntime/sessions",
    method: "post",
    action: withAgentRuntimeToken(createSession),
  },
  {
    path: "/agentRuntime/run",
    method: "post",
    action: withAgentRuntimeToken(runAgent),
  },
  {
    path: "/agentRuntime/sessions/:sessionId",
    method: "get",
    action: withAgentRuntimeToken(getSession),
  },
  {
    path: "/agentRuntime/sessions/:sessionId",
    method: "patch",
    action: withAgentRuntimeToken(updateSession),
  },
  {
    path: "/agentRuntime/runs/:runId",
    method: "get",
    action: withAgentRuntimeToken(getRun),
  },
];

function sendError(response: Response, error: unknown) {
  response.status(error instanceof Error && error.message === "Forbidden" ? 403 : 400).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}
