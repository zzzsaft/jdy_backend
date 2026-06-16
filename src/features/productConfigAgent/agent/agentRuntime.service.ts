import type { DataSource } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { agentRuntimeService } from "../../agentRuntime/defaultRuntime.js";
import type { ProductConfigAgentRunOptions } from "./types.js";
import {
  createGeneratedConfigShareToken,
  getGeneratedConfig,
  getSharedGeneratedConfig,
  revokeGeneratedConfigShareToken,
} from "./runtimeHandler.js";

export class ProductConfigAgentRuntimeService {
  constructor(private readonly dataSource: DataSource = PgDataSource) {}

  createSession(params: {
    ownerUserId?: string | null;
    title?: string | null;
    metadata?: unknown;
  }) {
    return agentRuntimeService.createSession({
      ...params,
      agentType: "productConfigAgent",
    });
  }

  run(options: ProductConfigAgentRunOptions) {
    return agentRuntimeService.run({
      ...options,
      agentType: "productConfigAgent",
    });
  }

  getSessionDetail(params: {
    sessionId: string;
    ownerUserId?: string | null;
  }) {
    return agentRuntimeService.getSessionDetail(params);
  }

  getGeneratedConfig(params: {
    id: string;
    ownerUserId?: string | null;
  }) {
    return getGeneratedConfig({
      dataSource: this.dataSource,
      ...params,
    });
  }

  createShareToken(params: {
    id: string;
    ownerUserId?: string | null;
    expiresInDays?: number;
  }) {
    return createGeneratedConfigShareToken({
      dataSource: this.dataSource,
      ...params,
    });
  }

  getSharedGeneratedConfig(shareToken: string) {
    return getSharedGeneratedConfig({
      dataSource: this.dataSource,
      shareToken,
    });
  }

  revokeShareToken(params: {
    id: string;
    ownerUserId?: string | null;
  }) {
    return revokeGeneratedConfigShareToken({
      dataSource: this.dataSource,
      ...params,
    });
  }
}

export const productConfigAgentRuntimeService =
  new ProductConfigAgentRuntimeService();
