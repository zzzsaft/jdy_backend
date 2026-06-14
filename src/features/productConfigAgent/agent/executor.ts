import { productConfigTools } from "../tools/index.js";
import type {
  ProductConfigAgentContext,
  ProductConfigAgentPlan,
} from "./types.js";

export async function executeProductConfigPlan(
  plan: ProductConfigAgentPlan,
): Promise<ProductConfigAgentContext> {
  const context: ProductConfigAgentContext = {
    toolResults: {},
    draftConfig: null,
    warnings: [],
  };

  for (const step of plan.steps) {
    const tool = productConfigTools[step.tool];
    if (!tool) {
      throw new Error(`Unsupported product config tool: ${step.tool}`);
    }

    context.toolResults[step.id] = await tool.run(step.args, context);
  }

  return context;
}
