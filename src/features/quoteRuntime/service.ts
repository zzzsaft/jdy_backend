import { agentRuntimeService } from "../agentRuntime/defaultRuntime.js";
import type {
  AgentRuntimeAgentType,
  AgentRuntimeRunOptions,
} from "../agentRuntime/index.js";

const QUOTE_RUNTIME_DEFAULT_AGENT_TYPE = "quoteAgent";

export class QuoteRuntimeService {
  constructor(
    private readonly runtime: typeof agentRuntimeService = agentRuntimeService,
  ) {}

  createSession(params: {
    agentType?: AgentRuntimeAgentType;
    ownerUserId?: string | null;
    title?: string | null;
    metadata?: unknown;
  }) {
    return this.runtime.createSession({
      ...params,
      agentType: params.agentType ?? QUOTE_RUNTIME_DEFAULT_AGENT_TYPE,
    });
  }

  run(options: AgentRuntimeRunOptions) {
    return this.runtime.run({
      ...options,
      agentType: options.agentType ?? QUOTE_RUNTIME_DEFAULT_AGENT_TYPE,
    });
  }

  listSessions(params?: {
    ownerUserId?: string | null;
    agentType?: AgentRuntimeAgentType;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    return this.runtime.listSessions({
      ...params,
      agentType: params?.agentType ?? QUOTE_RUNTIME_DEFAULT_AGENT_TYPE,
    });
  }

  updateSession(params: {
    sessionId: string;
    ownerUserId?: string | null;
    title?: string | null;
    status?: string;
    agentType?: AgentRuntimeAgentType;
    metadata?: unknown;
  }) {
    return this.runtime.updateSession({
      ...params,
      agentType: params.agentType ?? QUOTE_RUNTIME_DEFAULT_AGENT_TYPE,
    });
  }

  getSessionDetail(params: {
    sessionId: string;
    ownerUserId?: string | null;
  }) {
    return this.runtime.getSessionDetail(params);
  }

  getRunDetail(params: {
    runId: string;
    ownerUserId?: string | null;
  }) {
    return this.runtime.getRunDetail(params);
  }
}

export const quoteRuntimeService = new QuoteRuntimeService();
export { QUOTE_RUNTIME_DEFAULT_AGENT_TYPE };
