import type {
  ContractArchiveItemProductBindingSource,
  ContractArchiveItemProductErpMatchStatus,
  ContractArchiveItemProductRole,
} from "./entity/index.js";

export type JsonObject = Record<string, any>;

export type ContractArchivePatchChange = {
  path: string;
  value: unknown;
};

export type ContractArchiveProductBindingInput = {
  productNumber: string;
  role?: ContractArchiveItemProductRole;
  quantity?: string | null;
  bindingSource?: ContractArchiveItemProductBindingSource;
  confidence?: number | null;
  erpProductId?: string | null;
  erpParentProductNumber?: string | null;
  erpMatchStatus?: ContractArchiveItemProductErpMatchStatus;
  evidence?: unknown;
  note?: string | null;
};

export type ArchiveReadinessIssue = {
  type: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ArchiveReadiness = {
  documentId: number;
  extractionResultId: number | null;
  canArchive: boolean;
  forceRequired: boolean;
  blockers: ArchiveReadinessIssue[];
  warnings: ArchiveReadinessIssue[];
  summary: {
    itemCount: number;
    termTypeCandidateCount: number;
    valueCandidateCount: number;
    productNumber: string | null;
    docInfoSource: "normalized_extraction_json" | "llm_plan_json" | "none";
  };
};

export const UPLOADED_STATUSES = [
  "uploaded",
  "parsed_blocks",
  "extracted",
  "planned",
  "planned_partial",
  "failed",
];
