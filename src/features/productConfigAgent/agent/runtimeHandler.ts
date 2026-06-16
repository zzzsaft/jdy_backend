import crypto from "node:crypto";
import type { DataSource } from "typeorm";
import {
  assertOwner,
  sanitizeJson,
  type AgentRuntimeAgentHandler,
} from "../../agentRuntime/index.js";
import { executeProductConfigPlan } from "./executor.js";
import { createProductConfigPlan } from "./planner.js";
import { AgentGeneratedConfig } from "./entity/index.js";
import type {
  ProductConfigAgentContext,
  ProductConfigAgentGeneratedConfigSummary,
  ProductConfigAgentSaveGeneratedConfigInput,
} from "./types.js";

export function createProductConfigAgentRuntimeHandler(): AgentRuntimeAgentHandler {
  return {
    agentType: "productConfigAgent",
    async createPlan(options) {
      return createProductConfigPlan(options.message);
    },
    async executePlan(input) {
      const context = await executeProductConfigPlan(input.plan as any, {
        context: {
          options: {
            ...input.options,
            message: input.options.message,
          },
          saveGeneratedConfig: (configInput) =>
            saveGeneratedConfig(input.dataSource, {
              ...configInput,
              runId: input.runId,
              sessionId: input.sessionId,
              ownerUserId: input.ownerUserId ?? null,
            }),
        },
        onToolStart: input.onToolStart as any,
        onToolFinish: input.onToolFinish as any,
      });
      return {
        context,
        artifacts: {
          generatedConfig: context.savedConfig,
        },
        assistantMessage: {
          content: buildAssistantSummary(context),
          contentJsonb: {
            generatedConfigId: context.savedConfig?.id ?? null,
            warnings: context.warnings,
          },
        },
        contextSummary: summarizeProductConfigContext(context),
      };
    },
    async listArtifactsForSession(params) {
      const configs = await params.dataSource
        .getRepository(AgentGeneratedConfig)
        .find({
          where: { sessionId: params.sessionId },
          order: { createdAt: "DESC" },
        });
      return {
        generatedConfigs: configs
          .filter(
            (config) =>
              !config.ownerUserId || config.ownerUserId === params.ownerUserId,
          )
          .map(mapGeneratedConfig),
      };
    },
  };
}

export async function getGeneratedConfig(params: {
  dataSource: DataSource;
  id: string;
  ownerUserId?: string | null;
}) {
  const config = await params.dataSource
    .getRepository(AgentGeneratedConfig)
    .findOne({ where: { id: params.id } });
  if (!config) {
    throw new Error(`Generated config not found: ${params.id}`);
  }
  assertOwner(config.ownerUserId, params.ownerUserId);
  return mapGeneratedConfig(config);
}

export async function createGeneratedConfigShareToken(params: {
  dataSource: DataSource;
  id: string;
  ownerUserId?: string | null;
}) {
  const config = await params.dataSource
    .getRepository(AgentGeneratedConfig)
    .findOne({ where: { id: params.id } });
  if (!config) {
    throw new Error(`Generated config not found: ${params.id}`);
  }
  assertOwner(config.ownerUserId, params.ownerUserId);
  config.shareToken = crypto.randomBytes(24).toString("base64url");
  await params.dataSource.getRepository(AgentGeneratedConfig).save(config);
  return mapGeneratedConfig(config);
}

export async function getSharedGeneratedConfig(params: {
  dataSource: DataSource;
  shareToken: string;
}) {
  const config = await params.dataSource
    .getRepository(AgentGeneratedConfig)
    .findOne({ where: { shareToken: params.shareToken } });
  if (!config) {
    throw new Error("Shared generated config not found");
  }
  return mapGeneratedConfig(config);
}

async function saveGeneratedConfig(
  dataSource: DataSource,
  input: ProductConfigAgentSaveGeneratedConfigInput & {
    runId: string;
    sessionId: string;
    ownerUserId?: string | null;
  },
): Promise<ProductConfigAgentGeneratedConfigSummary> {
  const config = await dataSource.getRepository(AgentGeneratedConfig).save(
    dataSource.getRepository(AgentGeneratedConfig).create({
      runId: input.runId,
      sessionId: input.sessionId,
      title: input.title ?? null,
      status: input.status,
      configJsonb: sanitizeJson(input.config),
      validationJsonb: sanitizeJson(input.validation),
      ownerUserId: input.ownerUserId ?? null,
    }),
  );
  return mapGeneratedConfig(config);
}

function mapGeneratedConfig(
  config: AgentGeneratedConfig,
): ProductConfigAgentGeneratedConfigSummary {
  return {
    id: Number(config.id),
    runId: Number(config.runId),
    sessionId: Number(config.sessionId),
    title: config.title,
    status: config.status,
    config: config.configJsonb,
    validation: config.validationJsonb,
    shareToken: config.shareToken,
    ownerUserId: config.ownerUserId,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

function summarizeProductConfigContext(context: ProductConfigAgentContext) {
  return {
    toolResultKeys: Object.keys(context.toolResults),
    hasDraftConfig: Boolean(context.draftConfig),
    hasValidation: Boolean(context.validation),
    generatedConfigId: context.savedConfig?.id ?? null,
    warnings: context.warnings,
  };
}

function buildAssistantSummary(context: ProductConfigAgentContext): string {
  if (context.savedConfig) {
    return `已生成产品配置表：${context.savedConfig.title ?? context.savedConfig.id}`;
  }
  if (context.draftConfig) {
    return "已生成产品配置表草稿，但未保存为配置工件。";
  }
  return "已完成 productConfigAgent 运行。";
}
