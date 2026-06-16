import assert from "node:assert/strict";
import { executeProductConfigPlan } from "./executor.js";
import { createProductConfigPlan } from "./planner.js";

const plan = await createProductConfigPlan(
  "请给客户:测试客户 产品类型:过滤器 产品编号:PN-001 生成配置表",
);

assert.equal(plan.intent, "generate_config");
assert.equal(plan.entities.customerName, "测试客户");
assert.equal(plan.entities.productType, "过滤器");
assert.equal(plan.entities.productNumber, "PN-001");
assert.ok(plan.steps.some((step) => step.tool === "generateConfigDraft"));
assert.ok(plan.steps.some((step) => step.tool === "saveProductConfig"));

const trace: string[] = [];
const context = await executeProductConfigPlan(
  {
    ...plan,
    steps: plan.steps.filter((step) =>
      ["generateConfigDraft", "validateConfig", "saveProductConfig"].includes(
        step.tool,
      ),
    ),
  },
  {
    context: {
      options: {
        message: "生成配置表",
        confirmed: true,
      },
      async saveGeneratedConfig(input) {
        return {
          id: 1,
          runId: 2,
          sessionId: 3,
          title: input.title ?? null,
          status: input.status,
          config: input.config,
          validation: input.validation,
          shareToken: null,
          ownerUserId: "tester",
        };
      },
    },
    async onToolStart({ step }) {
      trace.push(`start:${step.id}`);
    },
    async onToolFinish({ step, error }) {
      trace.push(`${error ? "failed" : "done"}:${step.id}`);
    },
  },
);

assert.ok(context.draftConfig);
assert.equal(context.validation?.canSave, true);
assert.equal(context.savedConfig?.status, "confirmed");
assert.deepEqual(trace, [
  "start:generate_config_draft",
  "done:generate_config_draft",
  "start:validate_config",
  "done:validate_config",
  "start:save_product_config",
  "done:save_product_config",
]);

console.log("productConfigAgent agent runtime tests passed");
