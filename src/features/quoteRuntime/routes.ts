import type { Request, Response } from "express";
import { AgentRuntimeRoutes } from "../agentRuntime/routes.js";

type RuntimeRoute = (typeof AgentRuntimeRoutes)[number];

export function withQuoteRuntimeDefaultAgentType(
  action: RuntimeRoute["action"],
): RuntimeRoute["action"] {
  return async (request: Request, response: Response) => {
    const body =
      request.body && typeof request.body === "object" ? request.body : {};
    await action(
      {
        ...request,
        body: {
          ...body,
          agentType: body.agentType ?? "quoteAgent",
        },
      } as Request,
      response,
    );
  };
}

export const QuoteRuntimeRoutes = AgentRuntimeRoutes.map((route) => ({
  ...route,
  path: route.path.replace("/agentRuntime", "/quoteRuntime"),
  action:
    route.method === "post" || route.method === "patch"
      ? withQuoteRuntimeDefaultAgentType(route.action)
      : route.action,
}));
