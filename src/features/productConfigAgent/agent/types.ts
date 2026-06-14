export type ProductConfigAgentIntent =
  | "generate_config"
  | "search_cases"
  | "explain_config"
  | "modify_config"
  | "clarify";

export type ProductConfigAgentReferenceMode =
  | "common"
  | "latest"
  | "similar"
  | "deal_won";

export type ProductConfigAgentEntities = {
  customerName?: string;
  industry?: string;
  productType?: string;
  referenceMode?: ProductConfigAgentReferenceMode;
  constraints?: Record<string, unknown>;
};

export type ProductConfigAgentToolName =
  | "searchCustomerConfigs"
  | "searchIndustryConfigs"
  | "searchSimilarConfigs"
  | "getProductRules"
  | "generateConfigDraft"
  | "validateConfig"
  | "saveProductConfig";

export type ProductConfigAgentPlanStep = {
  id: string;
  tool: ProductConfigAgentToolName;
  args: Record<string, unknown>;
};

export type ProductConfigAgentPlan = {
  intent: ProductConfigAgentIntent;
  entities: ProductConfigAgentEntities;
  missingRequiredFields: string[];
  steps: ProductConfigAgentPlanStep[];
};

export type ProductConfigAgentContext = {
  toolResults: Record<string, unknown>;
  draftConfig: unknown | null;
  warnings: string[];
};

export type ProductConfigAgentResult = {
  plan: ProductConfigAgentPlan;
  context: ProductConfigAgentContext;
};
