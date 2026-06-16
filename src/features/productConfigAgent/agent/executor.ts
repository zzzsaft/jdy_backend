import { productConfigTools } from "../tools/index.js";
import type {
  ProductConfigAgentContext,
  ProductConfigAgentExecuteOptions,
  ProductConfigAgentPlan,
} from "./types.js";

export async function executeProductConfigPlan(
  plan: ProductConfigAgentPlan,
  options?: ProductConfigAgentExecuteOptions,
): Promise<ProductConfigAgentContext> {
  const context: ProductConfigAgentContext = {
    toolResults: {},
    draftConfig: null,
    validation: null,
    savedConfig: null,
    warnings: [],
    ...options?.context,
  };

  for (const step of plan.steps) {
    const tool = productConfigTools[step.tool];
    if (!tool) {
      throw new Error(`Unsupported product config tool: ${step.tool}`);
    }

    await options?.onToolStart?.({ step });
    const startedAt = Date.now();
    try {
      const result = await tool.run(step.args, context);
      context.toolResults[step.id] = result;
      await options?.onToolFinish?.({
        step,
        result,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      await options?.onToolFinish?.({
        step,
        error,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  return context;
}
