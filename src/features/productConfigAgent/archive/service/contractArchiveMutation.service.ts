import { DataSource, EntityManager } from "typeorm";
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
    editReason?: string | null;
  }) {
    if (!Array.isArray(params.changes) || params.changes.length === 0) {
      throw new Error("changes is required");
    }
    assertAllowedArchivePatchChanges(params.changes);

    return await this.dataSource.transaction(async (manager) => {
      const beforeDetail = await this.queryService.getArchiveDetail(
        params.archiveId,
        manager,
      );
      const beforeSnapshot = cloneJson(beforeDetail.archive);
      const nextSnapshot = cloneJson(beforeDetail.archive);
      assertAllowedArchivePatchChangesAgainstSnapshot(
        beforeSnapshot,
        params.changes,
      );
      const changeSummary = params.changes.map((change) => {
        const before = readPath(nextSnapshot, change.path);
        writePath(nextSnapshot, change.path, change.value);
        return {
          path: change.path,
          before,
          after: change.value,
        };
      });

      await this.persistSnapshot(params.archiveId, nextSnapshot, manager);
      const archive = await manager.getRepository(ContractArchive).findOne({
        where: { id: String(params.archiveId) },
      });
      if (!archive) {
        throw new Error(`Contract archive not found: ${params.archiveId}`);
      }
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
          editReason: params.editReason ?? null,
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
    editReason?: string | null;
  }) {
    return await this.dataSource.transaction(async (manager) => {
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

      const archive = await manager.getRepository(ContractArchive).findOne({
        where: { id: String(params.archiveId) },
      });
      if (!archive) {
        throw new Error(`Contract archive not found: ${params.archiveId}`);
      }
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
          editReason: params.editReason ?? "product_bindings",
        }),
      );

      return { archive: afterDetail.archive, version: mapVersion(version, false) };
    });
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
