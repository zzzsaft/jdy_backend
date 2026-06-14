import { executeProductConfigPlan } from "./executor.js";
import { createProductConfigPlan } from "./planner.js";
import type { ProductConfigAgentResult } from "./types.js";

export async function runProductConfigAgent(
  userMessage: string,
): Promise<ProductConfigAgentResult> {
  const plan = await createProductConfigPlan(userMessage);
  const context = await executeProductConfigPlan(plan);
  return { plan, context };
}
