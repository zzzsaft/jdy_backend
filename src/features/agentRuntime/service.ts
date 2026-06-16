import type { DataSource } from "typeorm";
import { PgDataSource } from "../../config/data-source.js";
import {
  AgentMessage,
  AgentRun,
  AgentSession,
  AgentToolCall,
} from "./entity/index.js";
import { routeAgentRuntimeMessage } from "./router.js";
import type {
  AgentRuntimeAgentHandler,
  AgentRuntimeAgentType,
  AgentRuntimeMessageSummary,
  AgentRuntimeRunOptions,
  AgentRuntimeRunSummary,
  AgentRuntimeSessionSummary,
  AgentRuntimeToolCallSummary,
} from "./types.js";

export class AgentRuntimeService {
  private readonly handlers = new Map<AgentRuntimeAgentType, AgentRuntimeAgentHandler>();

  constructor(private readonly dataSource: DataSource = PgDataSource) {}

  registerAgent(handler: AgentRuntimeAgentHandler): this {
    this.handlers.set(handler.agentType, handler);
    return this;
  }

  async createSession(params: {
    agentType?: AgentRuntimeAgentType;
    ownerUserId?: string | null;
    title?: string | null;
    metadata?: unknown;
  }) {
    const session = await this.dataSource.getRepository(AgentSession).save(
      this.dataSource.getRepository(AgentSession).create({
        agentType: params.agentType ?? "generalAgent",
        title: params.title ?? null,
        ownerUserId: params.ownerUserId ?? null,
        status: "active",
        metadataJsonb: params.metadata ?? {},
      }),
    );
    return mapSession(session);
  }

  async listSessions(params?: {
    ownerUserId?: string | null;
    agentType?: AgentRuntimeAgentType;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params?.page ?? 1) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(params?.pageSize ?? 20) || 20),
    );
    const query = this.dataSource
      .getRepository(AgentSession)
      .createQueryBuilder("session")
      .orderBy("session.updated_at", "DESC")
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    if (params?.ownerUserId) {
      query.andWhere("session.owner_user_id = :ownerUserId", {
        ownerUserId: params.ownerUserId,
      });
    }
    if (params?.agentType) {
      query.andWhere("session.agent_type = :agentType", {
        agentType: params.agentType,
      });
    }
    if (params?.status) {
      query.andWhere("session.status = :status", { status: params.status });
    }

    const [items, total] = await query.getManyAndCount();
    return {
      page,
      pageSize,
      total,
      items: items.map(mapSession),
    };
  }

  async updateSession(params: {
    sessionId: string;
    ownerUserId?: string | null;
    title?: string | null;
    status?: string;
    agentType?: AgentRuntimeAgentType;
    metadata?: unknown;
  }) {
    const session = await this.dataSource
      .getRepository(AgentSession)
      .findOne({ where: { id: params.sessionId } });
    if (!session) {
      throw new Error(`Agent session not found: ${params.sessionId}`);
    }
    assertOwner(session.ownerUserId, params.ownerUserId);
    if (params.title !== undefined) {
      session.title = params.title;
    }
    if (params.status !== undefined) {
      if (!["active", "archived"].includes(params.status)) {
        throw new Error("status must be active or archived");
      }
      session.status = params.status;
    }
    if (params.agentType !== undefined) {
      session.agentType = params.agentType;
    }
    if (params.metadata !== undefined) {
      session.metadataJsonb = params.metadata;
    }
    await this.dataSource.getRepository(AgentSession).save(session);
    return mapSession(session);
  }

  async run(options: AgentRuntimeRunOptions) {
    const message = options.message.trim();
    if (!message) {
      throw new Error("message is required");
    }

    const routeDecision = options.agentType
      ? {
          agentType: options.agentType,
          confidence: 1,
          reason: "agentType explicitly provided",
          needsClarification: false,
        }
      : routeAgentRuntimeMessage(message);

    if (routeDecision.needsClarification) {
      const session = options.sessionId
        ? await this.requireOwnedSession(options.sessionId, options.ownerUserId)
        : await this.createSession({
            agentType: routeDecision.agentType,
            ownerUserId: options.ownerUserId,
            title: createSessionTitle(message),
            metadata: { routeDecision },
          });
      const userMessage = await this.createMessage({
        sessionId: String(session.id),
        role: "user",
        content: message,
        contentJsonb: { routeDecision },
      });
      const assistantMessage = await this.createMessage({
        sessionId: String(session.id),
        role: "assistant",
        content: routeDecision.clarificationMessage ?? "Please confirm which agent should handle this request.",
        contentJsonb: { routeDecision },
      });
      return {
        session,
        run: null,
        messages: [userMessage, assistantMessage],
        artifacts: {},
        context: { routeDecision },
      };
    }

    const handler = this.handlers.get(routeDecision.agentType);
    if (!handler) {
      const session = options.sessionId
        ? await this.requireOwnedSession(options.sessionId, options.ownerUserId)
        : await this.createSession({
            agentType: routeDecision.agentType,
            ownerUserId: options.ownerUserId,
            title: createSessionTitle(message),
            metadata: { routeDecision },
          });
      const userMessage = await this.createMessage({
        sessionId: String(session.id),
        role: "user",
        content: message,
        contentJsonb: {
          routeDecision,
          unsupportedAgentType: routeDecision.agentType,
        },
      });
      const assistantMessage = await this.createMessage({
        sessionId: String(session.id),
        role: "assistant",
        content: `The ${routeDecision.agentType} runtime is reserved but not enabled yet.`,
        contentJsonb: {
          routeDecision,
          unsupportedAgentType: routeDecision.agentType,
        },
      });
      return {
        session,
        run: null,
        messages: [userMessage, assistantMessage],
        artifacts: {},
        context: {
          routeDecision,
          unsupportedAgentType: routeDecision.agentType,
        },
      };
    }

    const session = options.sessionId
      ? await this.requireOwnedSession(options.sessionId, options.ownerUserId)
      : await this.createSession({
          agentType: handler.agentType,
          ownerUserId: options.ownerUserId,
          title: createSessionTitle(message),
          metadata: { routeDecision },
        });

    const sessionId = String(session.id);
    const userMessage = await this.createMessage({
      sessionId,
      role: "user",
      content: message,
      contentJsonb: {
        routeDecision,
        confirmed: options.confirmed === true,
        referenceConfigId: options.referenceConfigId ?? null,
        context: options.context ?? null,
      },
    });

    const plan = await handler.createPlan({ ...options, agentType: handler.agentType });
    const run = await this.dataSource.getRepository(AgentRun).save(
      this.dataSource.getRepository(AgentRun).create({
        sessionId,
        agentType: handler.agentType,
        intent: typeof plan.intent === "string" ? plan.intent : null,
        status: "running",
        plannerJsonb: plan,
        contextSummaryJsonb: {},
      }),
    );
    const toolCallIdsByStepId = new Map<string, string>();

    try {
      const result = await handler.executePlan({
        dataSource: this.dataSource,
        runId: run.id,
        sessionId,
        ownerUserId: options.ownerUserId ?? null,
        options: { ...options, agentType: handler.agentType },
        plan,
        onToolStart: async ({ step }) => {
          const toolCall = await this.dataSource.getRepository(AgentToolCall).save(
            this.dataSource.getRepository(AgentToolCall).create({
              runId: run.id,
              stepId: step.id,
              toolName: step.tool,
              argsJsonb: step.args,
              status: "running",
            }),
          );
          toolCallIdsByStepId.set(step.id, toolCall.id);
        },
        onToolFinish: async ({ step, result, error, durationMs }) => {
          const toolCallId = toolCallIdsByStepId.get(step.id);
          if (!toolCallId) return;
          await this.dataSource.getRepository(AgentToolCall).update(
            toolCallId,
            {
              resultJsonb: error ? null : sanitizeJson(result),
              errorJsonb: error ? serializeError(error) : null,
              status: error ? "failed" : "completed",
              durationMs,
            } as any,
          );
        },
      });
      const contextSummary =
        result.contextSummary ?? summarizeContext(result.context, result.artifacts);
      await this.dataSource.getRepository(AgentRun).update(run.id, {
        status: "completed",
        contextSummaryJsonb: contextSummary,
      });

      const assistantMessage = await this.createMessage({
        sessionId,
        role: "assistant",
        content: result.assistantMessage?.content ?? "Agent run completed.",
        contentJsonb: {
          runId: Number(run.id),
          ...(isRecord(result.assistantMessage?.contentJsonb)
            ? result.assistantMessage?.contentJsonb
            : {}),
        },
      });

      return {
        session,
        run: mapRun({
          ...run,
          status: "completed",
          contextSummaryJsonb: contextSummary,
        } as AgentRun),
        messages: [userMessage, assistantMessage],
        artifacts: result.artifacts ?? {},
        context: result.context,
      };
    } catch (error) {
      await this.dataSource.getRepository(AgentRun).update(run.id, {
        status: "failed",
        errorJsonb: serializeError(error),
      } as any);
      await this.createMessage({
        sessionId,
        role: "assistant",
        content: `Run failed: ${error instanceof Error ? error.message : String(error)}`,
        contentJsonb: {
          runId: Number(run.id),
          error: serializeError(error),
        },
      });
      throw error;
    }
  }

  async getSessionDetail(params: {
    sessionId: string;
    ownerUserId?: string | null;
  }) {
    const session = await this.requireOwnedSession(
      params.sessionId,
      params.ownerUserId,
    );
    const [messages, runs] = await Promise.all([
      this.dataSource.getRepository(AgentMessage).find({
        where: { sessionId: String(session.id) },
        order: { createdAt: "ASC" },
      }),
      this.dataSource.getRepository(AgentRun).find({
        where: { sessionId: String(session.id) },
        order: { createdAt: "DESC" },
      }),
    ]);
    const artifacts: Record<string, unknown> = {};
    for (const handler of this.handlers.values()) {
      if (!handler.listArtifactsForSession) {
        continue;
      }
      Object.assign(
        artifacts,
        await handler.listArtifactsForSession({
          sessionId: String(session.id),
          ownerUserId: params.ownerUserId ?? null,
          dataSource: this.dataSource,
        }),
      );
    }

    return {
      session,
      messages: messages.map(mapMessage),
      runs: runs.map(mapRun),
      artifacts,
    };
  }

  async getRunDetail(params: {
    runId: string;
    ownerUserId?: string | null;
  }) {
    const run = await this.dataSource
      .getRepository(AgentRun)
      .findOne({ where: { id: params.runId } });
    if (!run) {
      throw new Error(`Agent run not found: ${params.runId}`);
    }
    await this.requireOwnedSession(run.sessionId, params.ownerUserId);
    const toolCalls = await this.dataSource.getRepository(AgentToolCall).find({
      where: { runId: run.id },
      order: { createdAt: "ASC" },
    });
    return {
      run: mapRun(run),
      toolCalls: toolCalls.map(mapToolCall),
    };
  }

  private async requireOwnedSession(
    sessionId: string,
    ownerUserId?: string | null,
  ): Promise<AgentRuntimeSessionSummary> {
    const session = await this.dataSource
      .getRepository(AgentSession)
      .findOne({ where: { id: sessionId } });
    if (!session) {
      throw new Error(`Agent session not found: ${sessionId}`);
    }
    assertOwner(session.ownerUserId, ownerUserId);
    return mapSession(session);
  }

  private async createMessage(params: {
    sessionId: string;
    role: "user" | "assistant" | "system" | "tool";
    content?: string | null;
    contentJsonb?: unknown;
  }) {
    const message = await this.dataSource.getRepository(AgentMessage).save(
      this.dataSource.getRepository(AgentMessage).create({
        sessionId: params.sessionId,
        role: params.role,
        content: params.content ?? null,
        contentJsonb: params.contentJsonb ?? null,
      }),
    );
    await this.touchSession(params.sessionId);
    return mapMessage(message);
  }

  private async touchSession(sessionId: string) {
    await this.dataSource.getRepository(AgentSession).update(
      sessionId,
      { updatedAt: new Date() } as any,
    );
  }
}

export function mapSession(session: AgentSession): AgentRuntimeSessionSummary {
  return {
    id: Number(session.id),
    agentType: session.agentType,
    title: session.title,
    ownerUserId: session.ownerUserId,
    status: session.status,
    metadata: session.metadataJsonb,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function mapMessage(message: AgentMessage): AgentRuntimeMessageSummary {
  return {
    id: Number(message.id),
    sessionId: Number(message.sessionId),
    role: message.role,
    content: message.content,
    contentJsonb: message.contentJsonb,
    createdAt: message.createdAt,
  };
}

export function mapRun(run: AgentRun): AgentRuntimeRunSummary {
  return {
    id: Number(run.id),
    sessionId: Number(run.sessionId),
    agentType: run.agentType,
    intent: run.intent,
    status: run.status,
    planner: run.plannerJsonb,
    contextSummary: run.contextSummaryJsonb,
    error: run.errorJsonb,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function mapToolCall(
  toolCall: AgentToolCall,
): AgentRuntimeToolCallSummary {
  return {
    id: Number(toolCall.id),
    runId: Number(toolCall.runId),
    stepId: toolCall.stepId,
    toolName: toolCall.toolName,
    args: toolCall.argsJsonb,
    result: toolCall.resultJsonb,
    status: toolCall.status,
    error: toolCall.errorJsonb,
    durationMs: toolCall.durationMs,
    createdAt: toolCall.createdAt,
    updatedAt: toolCall.updatedAt,
  };
}

export function assertOwner(
  resourceOwnerUserId: string | null,
  currentUserId?: string | null,
) {
  if (resourceOwnerUserId && resourceOwnerUserId !== currentUserId) {
    throw new Error("Forbidden");
  }
}

export function sanitizeJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function serializeError(error: unknown) {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "Error",
  };
}

function createSessionTitle(message: string): string {
  return message.length > 40 ? `${message.slice(0, 40)}...` : message;
}

function summarizeContext(context: unknown, artifacts?: Record<string, unknown>) {
  return {
    context: sanitizeJson(context),
    artifactKeys: Object.keys(artifacts ?? {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
