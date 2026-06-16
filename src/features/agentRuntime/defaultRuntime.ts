import { PgDataSource } from "../../config/data-source.js";
import { createProductConfigAgentRuntimeHandler } from "../productConfigAgent/agent/runtimeHandler.js";
import { AgentRuntimeService } from "./service.js";

export const agentRuntimeService = new AgentRuntimeService(PgDataSource)
  .registerAgent(createProductConfigAgentRuntimeHandler());
