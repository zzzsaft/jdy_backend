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
  customerId?: string;
  industry?: string;
  productType?: string;
  productNumber?: string;
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
  validation: ProductConfigAgentValidationResult | null;
  savedConfig: ProductConfigAgentGeneratedConfigSummary | null;
  warnings: string[];
  options?: ProductConfigAgentRunOptions;
  saveGeneratedConfig?: (
    input: ProductConfigAgentSaveGeneratedConfigInput,
  ) => Promise<ProductConfigAgentGeneratedConfigSummary>;
};

export type ProductConfigAgentResult = {
  plan: ProductConfigAgentPlan;
  context: ProductConfigAgentContext;
};

export type ProductConfigAgentRunOptions = {
  sessionId?: string;
  message: string;
  confirmed?: boolean;
  referenceConfigId?: string;
  llmModel?: string;
  ownerUserId?: string | null;
};

export type ProductConfigAgentDraftConfig = {
  title: string;
  customerName?: string;
  customerId?: string;
  industry?: string;
  productType?: string;
  productNumber?: string;
  items: Array<{
    itemIndex: number;
    productType?: string;
    productNumber?: string;
    fields: Array<{
      fieldName: string;
      termType?: string;
      value: unknown;
      source?: string;
      confidence?: number;
    }>;
  }>;
  evidence: unknown[];
};

export type ProductConfigAgentValidationIssue = {
  type: string;
  message: string;
  severity: "blocker" | "warning";
  details?: Record<string, unknown>;
};

export type ProductConfigAgentValidationResult = {
  canSave: boolean;
  issues: ProductConfigAgentValidationIssue[];
};

export type ProductConfigAgentGeneratedConfigSummary = {
  id: number;
  runId: number;
  sessionId: number;
  title: string | null;
  status: "draft" | "confirmed" | "archived";
  config: unknown;
  validation: unknown;
  shareToken: string | null;
  shareTokenExpiresAt: Date | null;
  shareTokenRevokedAt: Date | null;
  ownerUserId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ProductConfigAgentSaveGeneratedConfigInput = {
  title?: string | null;
  status: "draft" | "confirmed";
  config: unknown;
  validation: unknown;
};

export type ProductConfigAgentToolTraceStart = {
  step: ProductConfigAgentPlanStep;
};

export type ProductConfigAgentToolTraceFinish = {
  step: ProductConfigAgentPlanStep;
  result?: unknown;
  error?: unknown;
  durationMs: number;
};

export type ProductConfigAgentExecuteOptions = {
  context?: Partial<ProductConfigAgentContext>;
  onToolStart?: (event: ProductConfigAgentToolTraceStart) => Promise<void>;
  onToolFinish?: (event: ProductConfigAgentToolTraceFinish) => Promise<void>;
};

export type ProductConfigAgentSessionSummary = {
  id: number;
  agentType: string;
  title: string | null;
  ownerUserId: string | null;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductConfigAgentMessageSummary = {
  id: number;
  sessionId: number;
  role: string;
  content: string | null;
  contentJsonb: unknown;
  createdAt: Date;
};

export type ProductConfigAgentRunSummary = {
  id: number;
  sessionId: number;
  agentType: string;
  intent: string | null;
  status: string;
  planner: unknown;
  contextSummary: unknown;
  error: unknown;
  createdAt: Date;
  updatedAt: Date;
};
