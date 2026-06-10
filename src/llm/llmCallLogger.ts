import { PgDataSource } from "../config/data-source.js";
import { LlmCallLog } from "./entity/llmCallLog.entity.js";

export type LlmCallLogStartParams = {
  provider: string;
  model: string;
  purpose: string;
  input: unknown;
};

export async function startLlmCallLog(params: LlmCallLogStartParams) {
  if (!PgDataSource.isInitialized) {
    return null;
  }

  try {
    const repo = PgDataSource.getRepository(LlmCallLog);
    const startedAt = new Date();
    return await repo.save(
      repo.create({
        provider: params.provider,
        model: params.model,
        purpose: params.purpose,
        input: params.input,
        output: null,
        error: null,
        status: "pending",
        latencyMs: null,
        startedAt,
        completedAt: null,
      }),
    );
  } catch {
    return null;
  }
}

export async function finishLlmCallLog(
  log: LlmCallLog | null,
  params: { output?: unknown; error?: unknown },
) {
  if (!log || !PgDataSource.isInitialized) {
    return;
  }

  try {
    const completedAt = new Date();
    await PgDataSource.getRepository(LlmCallLog).update(
      { id: log.id },
      {
        output: params.output ?? null,
        error:
          params.error === undefined
            ? null
            : params.error instanceof Error
              ? params.error.message
              : String(params.error),
        status: params.error === undefined ? "success" : "failed",
        latencyMs: completedAt.getTime() - log.startedAt.getTime(),
        completedAt,
      } as any,
    );
  } catch {
    return;
  }
}
