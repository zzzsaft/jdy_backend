import { productConfigAgentRuntimeService } from "./agentRuntime.service.js";
import { executeProductConfigPlan } from "./executor.js";
import { createProductConfigPlan } from "./planner.js";
import type {
  ProductConfigAgentResult,
  ProductConfigAgentRunOptions,
} from "./types.js";

export async function runProductConfigAgent(
  userMessageOrOptions: string | ProductConfigAgentRunOptions,
): Promise<ProductConfigAgentResult | Awaited<ReturnType<typeof productConfigAgentRuntimeService.run>>> {
  if (typeof userMessageOrOptions === "string") {
    const plan = await createProductConfigPlan(userMessageOrOptions);
    const context = await executeProductConfigPlan(plan, {
      context: { options: { message: userMessageOrOptions } },
    });
    return { plan, context };
  }
  return productConfigAgentRuntimeService.run(userMessageOrOptions);
}
