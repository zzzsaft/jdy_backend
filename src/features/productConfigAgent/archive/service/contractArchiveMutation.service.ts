import { DataSource, EntityManager, In } from "typeorm";
import { Documents } from "../../workflow/entity/documents.entity.js";
import { ExtractionResults } from "../../extraction/entity/extractionResults.entity.js";
import {
  ContractArchive,
  ContractArchiveItem,
  ContractArchiveItemProduct,
  ContractArchiveVersion,
  type ContractArchiveItemProductNumberStatus,
} from "../entity/index.js";
import type {
  ContractArchivePatchChange,
  ContractArchiveProductBindingInput,
  JsonObject,
} from "../types.js";
import {
  getFieldConfidence,
  normalizeDocInfo,
  summarizeDocInfo,
} from "../utils/docInfo.js";
import {
  assertAllowedArchivePatchChangesAgainstSnapshot,
  assertAllowedArchivePatchChanges,
  cloneJson,
  collapseArchivePatchArrayChanges,
  readPath,
  writePath,
} from "../utils/jsonPatch.js";
import { normalizeOptionalString } from "../utils/string.js";
import { mapVersion } from "./contractArchive.mapper.js";
import { ContractArchiveQueryService } from "./contractArchiveQuery.service.js";
import { ContractArchiveReadinessService } from "./contractArchiveReadiness.service.js";

export class ContractArchiveMutationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly queryService: ContractArchiveQueryService,
    private readonly readinessService: ContractArchiveReadinessService,
  ) {}

  private async lockArchive(
    manager: EntityManager,
    archiveId: number,
  ): Promise<ContractArchive> {
    const archive = await manager.getRepository(ContractArchive).findOne({
      where: { id: String(archiveId) },
      lock: { mode: "pessimistic_write" },
    });
    if (!archive) {
      throw new Error(`Contract archive not found: ${archiveId}`);
    }
    return archive;
  }

  async archiveDocument(params: {
    documentId: number;
    archivedBy?: string | null;
    force?: boolean;
  }) {
    return await this.dataSource.transaction(async (manager) => {
      const document = await manager.getRepository(Documents).findOne({
        where: { id: params.documentId },
      });
      if (!document) {
        throw new Error(`Document not found: ${params.documentId}`);
      }

      const extraction =
        await this.readinessService.findNormalizedExtractionForArchive(
          params.documentId,
          manager,
        );
      if (!extraction) {
        throw new Error(`Normalized extraction not found: ${params.documentId}`);
      }

      const readiness = this.readinessService.checkExtraction(
        params.documentId,
        extraction,
        await this.readinessService.countPendingCandidates(
          extraction.id,
          manager,
        ),
      );
      if (!readiness.canArchive && params.force !== true) {
        throw new Error(
          `Archive readiness failed: ${readiness.blockers
            .map((blocker) => blocker.message)
            .join("; ")}`,
        );
      }

      const existing = await manager.getRepository(ContractArchive).findOne({
        where: {
          documentId: String(document.id),
          extractionResultId: String(extraction.id),
        },
      });
      if (existing) {
        return this.queryService.getArchiveDetail(Number(existing.id), manager);
      }

      const normalizedJson = extraction.normalizedExtractionJson as JsonObject;
      const { docInfo } = this.readinessService.getArchiveDocInfo(extraction);
      const summary = summarizeDocInfo(docInfo);
      const archive = await manager.getRepository(ContractArchive).save(
        manager.getRepository(ContractArchive).create({
          documentId: String(document.id),
          extractionResultId: String(extraction.id),
          status: "archived",
          productNumber: summary.productNumber,
          contractNumber: summary.contractNumber,
          orderNumber: summary.orderNumber,
          customerId: summary.customerId,
          country: summary.country,
          orderDate: summary.orderDate,
          deliveryDate: summary.deliveryDate,
          docInfoJsonb: docInfo,
          currentVersion: 1,
          archivedBy: params.archivedBy ?? null,
        }),
      );

      const rawItems = Array.isArray(normalizedJson?.items)
        ? normalizedJson.items
        : [];
      const multipleItems = rawItems.length > 1;
      for (const rawItem of rawItems) {
        const sourceProductNumber = summary.productNumber;
        const item = await manager.getRepository(ContractArchiveItem).save(
          manager.getRepository(ContractArchiveItem).create({
            archiveId: archive.id,
            documentId: String(document.id),
            extractionResultId: String(extraction.id),
            itemIndex: Number(rawItem?.item_index ?? 0),
            itemName: normalizeOptionalString(rawItem?.item_name),
            itemQuantity: normalizeOptionalString(rawItem?.item_quantity),
            productTypeHint: String(rawItem?.itemProductTypeHint ?? "unknown"),
            productTypeRawValue:
              normalizeOptionalString(rawItem?.itemProductTypeHintRawValue),
            productTypeDisplayName:
              normalizeOptionalString(rawItem?.itemProductTypeHintDisplayName),
            sourceProductNumber,
            productNumberStatus: sourceProductNumber
              ? multipleItems
                ? "inherited"
                : "bound"
              : "missing",
            fieldsJsonb: Array.isArray(rawItem?.fields) ? rawItem.fields : [],
            warningsJsonb: Array.isArray(rawItem?.warnings)
              ? rawItem.warnings
              : [],
          }),
        );

        if (sourceProductNumber) {
          await manager.getRepository(ContractArchiveItemProduct).save(
            manager.getRepository(ContractArchiveItemProduct).create({
              archiveId: archive.id,
              archiveItemId: item.id,
              productNumber: sourceProductNumber,
              role: "primary",
              quantity: item.itemQuantity,
              bindingSource: multipleItems ? "inherited" : "document",
              confidence: getFieldConfidence(docInfo.product_number),
              erpMatchStatus: "unmatched",
              evidenceJsonb: docInfo.product_number?.evidence ?? null,
            }),
          );
        }
      }

      const detail = await this.queryService.getArchiveDetail(Number(archive.id), manager);
      const version = await manager.getRepository(ContractArchiveVersion).save(
        manager.getRepository(ContractArchiveVersion).create({
          archiveId: archive.id,
          version: 1,
          snapshotJsonb: detail.archive,
          changeSummaryJsonb: params.force === true
            ? [
                {
                  path: "archive_readiness",
                  before: null,
                  after: readiness,
                },
              ]
            : [],
          editedBy: params.archivedBy ?? null,
          editReason: params.force === true
            ? "force_archive"
            : "archive",
        }),
      );

      return { ...detail, version: mapVersion(version, false) };
    });
  }

  async patchArchive(params: {
    archiveId: number;
    changes: ContractArchivePatchChange[];
    editedBy?: string | null;
  }) {
    if (!Array.isArray(params.changes) || params.changes.length === 0) {
      throw new Error("changes is required");
    }

    return await this.dataSource.transaction(async (manager) => {
      const archive = await this.lockArchive(manager, params.archiveId);
      const beforeDetail = await this.queryService.getArchiveDetail(
        params.archiveId,
        manager,
      );
      const beforeSnapshot = cloneJson(beforeDetail.archive);
      const nextSnapshot = cloneJson(beforeDetail.archive);
      const changes = collapseArchivePatchArrayChanges(
        beforeSnapshot,
        params.changes,
      );
      assertAllowedArchivePatchChanges(changes);
      assertAllowedArchivePatchChangesAgainstSnapshot(
        beforeSnapshot,
        changes,
      );
      const changeSummary = changes.map((change) => {
        const before = readPath(nextSnapshot, change.path);
        writePath(nextSnapshot, change.path, change.value);
        return {
          path: change.path,
          before,
          after: change.value,
        };
      });

      await this.persistSnapshot(params.archiveId, nextSnapshot, manager);
      archive.currentVersion += 1;
      await manager.getRepository(ContractArchive).save(archive);

      const afterDetail = await this.queryService.getArchiveDetail(
        params.archiveId,
        manager,
      );
      const version = await manager.getRepository(ContractArchiveVersion).save(
        manager.getRepository(ContractArchiveVersion).create({
          archiveId: archive.id,
          version: archive.currentVersion,
          snapshotJsonb: afterDetail.archive,
          changeSummaryJsonb: changeSummary,
          editedBy: params.editedBy ?? null,
          editReason: null,
        }),
      );

      return {
        archive: afterDetail.archive,
        version: mapVersion(version, false),
        before: beforeSnapshot,
      };
    });
  }

  async replaceItemProductBindings(params: {
    archiveId: number;
    itemId: number;
    bindings: ContractArchiveProductBindingInput[];
    editedBy?: string | null;
  }) {
    return await this.dataSource.transaction(async (manager) => {
      const archive = await this.lockArchive(manager, params.archiveId);
      const item = await manager.getRepository(ContractArchiveItem).findOne({
        where: {
          id: String(params.itemId),
          archiveId: String(params.archiveId),
        },
      });
      if (!item) {
        throw new Error(`Contract archive item not found: ${params.itemId}`);
      }

      const beforeDetail = await this.queryService.getArchiveDetail(
        params.archiveId,
        manager,
      );
      await manager.getRepository(ContractArchiveItemProduct).delete({
        archiveItemId: item.id,
      });

      const normalizedBindings = params.bindings
        .map((binding) => ({
          ...binding,
          productNumber: normalizeOptionalString(binding.productNumber),
        }))
        .filter((binding) => binding.productNumber);

      for (const binding of normalizedBindings) {
        await manager.getRepository(ContractArchiveItemProduct).save(
          manager.getRepository(ContractArchiveItemProduct).create({
            archiveId: String(params.archiveId),
            archiveItemId: item.id,
            productNumber: binding.productNumber!,
            role: binding.role ?? "unknown",
            quantity: normalizeOptionalString(binding.quantity),
            bindingSource: binding.bindingSource ?? "manual",
            confidence:
              binding.confidence === undefined ? null : binding.confidence,
            erpProductId: normalizeOptionalString(binding.erpProductId),
            erpParentProductNumber: normalizeOptionalString(
              binding.erpParentProductNumber,
            ),
            erpMatchStatus: binding.erpMatchStatus ?? "manual",
            evidenceJsonb: binding.evidence ?? null,
            note: normalizeOptionalString(binding.note),
          }),
        );
      }

      item.productNumberStatus = this.resolveProductNumberStatus(
        normalizedBindings.length,
      );
      await manager.getRepository(ContractArchiveItem).save(item);

      archive.currentVersion += 1;
      await manager.getRepository(ContractArchive).save(archive);

      const afterDetail = await this.queryService.getArchiveDetail(
        params.archiveId,
        manager,
      );
      const version = await manager.getRepository(ContractArchiveVersion).save(
        manager.getRepository(ContractArchiveVersion).create({
          archiveId: archive.id,
          version: archive.currentVersion,
          snapshotJsonb: afterDetail.archive,
          changeSummaryJsonb: [
            {
              path: `items.${item.itemIndex}.productBindings`,
              before: beforeDetail.archive.items.find(
                (candidate: any) => candidate.id === Number(item.id),
              )?.productBindings,
              after: afterDetail.archive.items.find(
                (candidate: any) => candidate.id === Number(item.id),
              )?.productBindings,
            },
          ],
          editedBy: params.editedBy ?? null,
          editReason: null,
        }),
      );

      return { archive: afterDetail.archive, version: mapVersion(version, false) };
    });
  }

  async refreshDirtyArchivesForDocument(params: {
    documentId: number;
    editedBy?: string | null;
  }) {
    const archives = await this.dataSource.getRepository(ContractArchive).find({
      where: {
        documentId: String(params.documentId),
        status: "dictionary_dirty",
      },
      order: { id: "ASC" },
    });
    const results: any[] = [];

    for (const archive of archives) {
      results.push(
        await this.refreshArchiveFromNormalizedExtraction({
          archiveId: Number(archive.id),
          editedBy: params.editedBy,
        }),
      );
    }

    return {
      updatedCount: results.length,
      versionCount: results.length,
      archiveIds: results.map((result) => result.archive.id),
      results,
    };
  }

  async refreshArchivesForDocuments(params: {
    documentIds: number[];
    editedBy?: string | null;
  }) {
    const documentIds = [
      ...new Set(
        params.documentIds
          .map((documentId) => Number(documentId))
          .filter((documentId) => Number.isFinite(documentId) && documentId > 0)
          .map((documentId) => String(Math.floor(documentId))),
      ),
    ];
    if (documentIds.length === 0) {
      return {
        updatedCount: 0,
        versionCount: 0,
        archiveIds: [],
        results: [],
      };
    }

    const archives = await this.dataSource.getRepository(ContractArchive).find({
      where: {
        documentId: In(documentIds),
      },
      order: { id: "ASC" },
    });
    const results: any[] = [];

    for (const archive of archives) {
      results.push(
        await this.refreshArchiveFromNormalizedExtraction({
          archiveId: Number(archive.id),
          editedBy: params.editedBy,
        }),
      );
    }

    return {
      updatedCount: results.length,
      versionCount: results.length,
      archiveIds: results.map((result) => result.archive.id),
      results,
    };
  }

  private async refreshArchiveFromNormalizedExtraction(params: {
    archiveId: number;
    editedBy?: string | null;
  }) {
    return await this.dataSource.transaction(async (manager) => {
      const archive = await this.lockArchive(manager, params.archiveId);
      const beforeDetail = await this.queryService.getArchiveDetail(
        params.archiveId,
        manager,
      );
      const beforeSnapshot = cloneJson(beforeDetail.archive);
      const extraction = await manager.getRepository(ExtractionResults).findOne({
        where: { id: Number(archive.extractionResultId) },
      });
      if (!extraction?.normalizedExtractionJson) {
        throw new Error(
          `Normalized extraction not found for archive: ${params.archiveId}`,
        );
      }

      await this.persistNormalizedExtractionToArchive({
        archive,
        extraction,
        manager,
      });

      archive.status = "archived";
      archive.currentVersion += 1;
      await manager.getRepository(ContractArchive).save(archive);

      const afterDetail = await this.queryService.getArchiveDetail(
        params.archiveId,
        manager,
      );
      const version = await manager.getRepository(ContractArchiveVersion).save(
        manager.getRepository(ContractArchiveVersion).create({
          archiveId: archive.id,
          version: archive.currentVersion,
          snapshotJsonb: afterDetail.archive,
          changeSummaryJsonb: [
            {
              path: "dictionary_refresh",
              source: archive.dirtyReason ?? "dictionary_dirty_refresh",
              dirtyReason: archive.dirtyReason ?? "dictionary_refresh",
              sourceRunId: archive.dirtySourceRunId,
              dictionaryVersion: archive.dirtyDictionaryVersion,
              normalizationRuleVersion: archive.dirtyNormalizationRuleVersion,
              resolverVersion: archive.dirtyResolverVersion,
              before: this.dictionaryRefreshSnapshot(beforeSnapshot),
              after: this.dictionaryRefreshSnapshot(afterDetail.archive),
            },
          ],
          editedBy: params.editedBy ?? "system",
          editReason: "dictionary_dirty_refresh",
        }),
      );

      return {
        archive: afterDetail.archive,
        version: mapVersion(version, false),
        before: beforeSnapshot,
      };
    });
  }

  private async persistNormalizedExtractionToArchive(params: {
    archive: ContractArchive;
    extraction: ExtractionResults;
    manager: EntityManager;
  }) {
    const normalizedJson = params.extraction.normalizedExtractionJson as JsonObject;
    const docInfo = normalizeDocInfo(normalizedJson?.document_info ?? {});
    const summary = summarizeDocInfo(docInfo);
    await params.manager.getRepository(ContractArchive).update(
      { id: params.archive.id },
      {
        productNumber: summary.productNumber,
        contractNumber: summary.contractNumber,
        orderNumber: summary.orderNumber,
        customerId: summary.customerId,
        country: summary.country,
        orderDate: summary.orderDate,
        deliveryDate: summary.deliveryDate,
        docInfoJsonb: docInfo,
      } as any,
    );

    const rawItems = Array.isArray(normalizedJson?.items)
      ? normalizedJson.items
      : [];
    const itemRepo = params.manager.getRepository(ContractArchiveItem);
    const productRepo = params.manager.getRepository(ContractArchiveItemProduct);
    const normalizedItemIndexes = new Set<number>();
    const multipleItems = rawItems.length > 1;
    for (const rawItem of rawItems) {
      const itemIndex = Number(rawItem?.item_index ?? 0);
      normalizedItemIndexes.add(itemIndex);
      const existing = await itemRepo.findOne({
        where: {
          archiveId: params.archive.id,
          itemIndex,
        },
      });
      const patch = {
        documentId: params.archive.documentId,
        extractionResultId: params.archive.extractionResultId,
        itemIndex,
        itemName: normalizeOptionalString(rawItem?.item_name),
        itemQuantity: normalizeOptionalString(rawItem?.item_quantity),
        productTypeHint: String(rawItem?.itemProductTypeHint ?? "unknown"),
        productTypeRawValue:
          normalizeOptionalString(rawItem?.itemProductTypeHintRawValue),
        productTypeDisplayName:
          normalizeOptionalString(rawItem?.itemProductTypeHintDisplayName),
        sourceProductNumber: summary.productNumber,
        productNumberStatus: summary.productNumber
          ? multipleItems
            ? "inherited"
            : "bound"
          : "missing",
        fieldsJsonb: Array.isArray(rawItem?.fields) ? rawItem.fields : [],
        warningsJsonb: Array.isArray(rawItem?.warnings) ? rawItem.warnings : [],
      };

      let savedItem: ContractArchiveItem;
      if (existing) {
        await itemRepo.update(
          { id: existing.id },
          patch as any,
        );
        savedItem = {
          ...existing,
          ...patch,
        } as ContractArchiveItem;
      } else {
        const createdItem = itemRepo.create({
          archiveId: params.archive.id,
          ...patch,
        } as Partial<ContractArchiveItem>);
        savedItem = await itemRepo.save(createdItem);
      }
      await this.syncSystemProductBinding({
        manager: params.manager,
        item: savedItem,
        sourceProductNumber: summary.productNumber,
        multipleItems,
        docInfo,
      });
    }

    const staleItems = await itemRepo
      .createQueryBuilder("item")
      .where("item.archive_id = :archiveId", { archiveId: params.archive.id })
      .andWhere(
        normalizedItemIndexes.size > 0
          ? "item.item_index NOT IN (:...itemIndexes)"
          : "1 = 1",
        { itemIndexes: [...normalizedItemIndexes] },
      )
      .getMany();
    if (staleItems.length > 0) {
      const staleItemIds = staleItems.map((item) => item.id);
      await productRepo.delete({ archiveItemId: In(staleItemIds) });
      await itemRepo.delete({ id: In(staleItemIds) });
    }
  }

  private async syncSystemProductBinding(params: {
    manager: EntityManager;
    item: ContractArchiveItem;
    sourceProductNumber: string | null;
    multipleItems: boolean;
    docInfo: Record<string, any>;
  }) {
    const productRepo = params.manager.getRepository(ContractArchiveItemProduct);
    await productRepo.delete({
      archiveItemId: params.item.id,
      bindingSource: In(["document", "inherited"]),
    });
    if (!params.sourceProductNumber) {
      return;
    }
    await productRepo.save(
      productRepo.create({
        archiveId: params.item.archiveId,
        archiveItemId: params.item.id,
        productNumber: params.sourceProductNumber,
        role: "primary",
        quantity: params.item.itemQuantity,
        bindingSource: params.multipleItems ? "inherited" : "document",
        confidence: getFieldConfidence(params.docInfo.product_number),
        erpMatchStatus: "unmatched",
        evidenceJsonb: params.docInfo.product_number?.evidence ?? null,
      }),
    );
  }

  private dictionaryRefreshSnapshot(snapshot: any) {
    return {
      status: snapshot.status,
      docInfo: snapshot.docInfo ?? {},
      items: Array.isArray(snapshot.items)
        ? snapshot.items.map((item: any) => ({
            id: item.id,
            itemIndex: item.itemIndex,
            itemName: item.itemName,
            productTypeHint: item.productTypeHint,
            fields: item.fields ?? [],
            warnings: item.warnings ?? [],
          }))
        : [],
    };
  }

  private async persistSnapshot(
    archiveId: number,
    snapshot: any,
    manager: EntityManager,
  ) {
    const docInfo = normalizeDocInfo(snapshot.docInfo ?? {});
    const summary = summarizeDocInfo(docInfo);
    await manager.getRepository(ContractArchive).update(
      { id: String(archiveId) },
      {
        productNumber: summary.productNumber,
        contractNumber: summary.contractNumber,
        orderNumber: summary.orderNumber,
        customerId: summary.customerId,
        country: summary.country,
        orderDate: summary.orderDate,
        deliveryDate: summary.deliveryDate,
        docInfoJsonb: docInfo,
      } as any,
    );

    const itemRepo = manager.getRepository(ContractArchiveItem);
    for (const snapshotItem of Array.isArray(snapshot.items) ? snapshot.items : []) {
      if (!snapshotItem.id) continue;
      await itemRepo.update(
        { id: String(snapshotItem.id), archiveId: String(archiveId) },
        {
          itemName: normalizeOptionalString(snapshotItem.itemName),
          itemQuantity: normalizeOptionalString(snapshotItem.itemQuantity),
          sourceProductNumber: normalizeOptionalString(
            snapshotItem.sourceProductNumber,
          ),
          productNumberStatus: snapshotItem.productNumberStatus ?? "missing",
          fieldsJsonb: Array.isArray(snapshotItem.fields)
            ? snapshotItem.fields
            : [],
          warningsJsonb: Array.isArray(snapshotItem.warnings)
            ? snapshotItem.warnings
            : [],
        } as any,
      );
    }
  }

  private resolveProductNumberStatus(
    bindingCount: number,
  ): ContractArchiveItemProductNumberStatus {
    if (bindingCount <= 0) return "missing";
    return "bound";
  }
}
