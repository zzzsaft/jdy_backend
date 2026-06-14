import { DataSource } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import type {
  ContractArchivePatchChange,
  ContractArchiveProductBindingInput,
} from "./types.js";
import { ContractArchiveMutationService } from "./service/contractArchiveMutation.service.js";
import { ContractArchiveQueryService } from "./service/contractArchiveQuery.service.js";
import { ContractArchiveReadinessService } from "./service/contractArchiveReadiness.service.js";
import { ContractArchiveVersionService } from "./service/contractArchiveVersion.service.js";
import { ProductConfigSearchService } from "./service/productConfigSearch.service.js";

export class ProductConfigAgentArchiveService {
  private readonly queryService: ContractArchiveQueryService;
  private readonly readinessService: ContractArchiveReadinessService;
  private readonly mutationService: ContractArchiveMutationService;
  private readonly versionService: ContractArchiveVersionService;
  private readonly productConfigSearchService: ProductConfigSearchService;

  constructor(private readonly dataSource: DataSource = PgDataSource) {
    this.queryService = new ContractArchiveQueryService(this.dataSource);
    this.readinessService = new ContractArchiveReadinessService(this.dataSource);
    this.mutationService = new ContractArchiveMutationService(
      this.dataSource,
      this.queryService,
      this.readinessService,
    );
    this.versionService = new ContractArchiveVersionService(this.dataSource);
    this.productConfigSearchService = new ProductConfigSearchService(
      this.dataSource,
    );
  }

  getContractsSummary() {
    return this.queryService.getContractsSummary();
  }

  listContracts(params?: {
    page?: number;
    pageSize?: number;
    status?: "uploaded" | "normalized" | "archived";
    q?: string;
    productNumber?: string;
    customerId?: string;
  }) {
    return this.queryService.listContracts(params);
  }

  listContractArchives(params?: {
    page?: number;
    pageSize?: number;
    q?: string;
    productNumber?: string;
    customerId?: string;
  }) {
    return this.queryService.listContractArchives(params);
  }

  getArchiveDetail(archiveId: number) {
    return this.queryService.getArchiveDetail(archiveId);
  }

  checkArchiveReadiness(documentId: number) {
    return this.readinessService.checkDocument(documentId);
  }

  archiveDocument(params: {
    documentId: number;
    archivedBy?: string | null;
    force?: boolean;
  }) {
    return this.mutationService.archiveDocument(params);
  }

  patchArchive(params: {
    archiveId: number;
    changes: ContractArchivePatchChange[];
    editedBy?: string | null;
    editReason?: string | null;
  }) {
    return this.mutationService.patchArchive(params);
  }

  replaceItemProductBindings(params: {
    archiveId: number;
    itemId: number;
    bindings: ContractArchiveProductBindingInput[];
    editedBy?: string | null;
    editReason?: string | null;
  }) {
    return this.mutationService.replaceItemProductBindings(params);
  }

  listVersions(archiveId: number) {
    return this.versionService.listVersions(archiveId);
  }

  getVersion(archiveId: number, versionNumber: number) {
    return this.versionService.getVersion(archiveId, versionNumber);
  }

  searchProductConfigs(params: {
    productNumber: string;
    customerId?: string;
    includeErp?: boolean;
  }) {
    return this.productConfigSearchService.searchProductConfigs(params);
  }
}

export const productConfigAgentArchiveService = new ProductConfigAgentArchiveService();
export type {
  ContractArchivePatchChange,
  ContractArchiveProductBindingInput,
} from "./types.js";
