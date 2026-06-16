import { Documents } from "../../workflow/entity/documents.entity.js";
import {
  ContractArchive,
  ContractArchiveItem,
  ContractArchiveItemProduct,
  ContractArchiveVersion,
} from "../entity/index.js";

export function mapBinding(binding: ContractArchiveItemProduct) {
  return {
    id: Number(binding.id),
    productNumber: binding.productNumber,
    role: binding.role,
    quantity: binding.quantity,
    bindingSource: binding.bindingSource,
    confidence: binding.confidence,
    erpProductId: binding.erpProductId,
    erpParentProductNumber: binding.erpParentProductNumber,
    erpMatchStatus: binding.erpMatchStatus,
    evidence: binding.evidenceJsonb,
    note: binding.note,
  };
}

export function mapArchive(archive: ContractArchive) {
  const items = [...(archive.items ?? [])].sort(
    (a, b) => a.itemIndex - b.itemIndex,
  );
  return {
    id: Number(archive.id),
    documentId: Number(archive.documentId),
    extractionResultId: Number(archive.extractionResultId),
    fileName: archive.document?.fileName ?? null,
    status: archive.status,
    productNumber: archive.productNumber,
    contractNumber: archive.contractNumber,
    orderNumber: archive.orderNumber,
    customerId: archive.customerId,
    country: archive.country,
    orderDate: archive.orderDate,
    deliveryDate: archive.deliveryDate,
    docInfo: archive.docInfoJsonb ?? {},
    currentVersion: archive.currentVersion,
    archivedBy: archive.archivedBy,
    createdAt: archive.createdAt,
    updatedAt: archive.updatedAt,
    items: items.map(mapArchiveItem),
  };
}

export function mapArchiveItem(item: ContractArchiveItem) {
  const fields = Array.isArray(item.fieldsJsonb) ? item.fieldsJsonb : [];
  const warnings = Array.isArray(item.warningsJsonb) ? item.warningsJsonb : [];
  return {
    id: Number(item.id),
    itemIndex: item.itemIndex,
    itemName: item.itemName,
    itemQuantity: item.itemQuantity,
    productTypeHint: item.productTypeHint,
    productTypeRawValue: item.productTypeRawValue,
    productTypeDisplayName: item.productTypeDisplayName,
    sourceProductNumber: item.sourceProductNumber,
    productNumberStatus: item.productNumberStatus,
    masterDataMatch: resolveArchiveItemMasterDataMatch(fields, warnings),
    fields,
    warnings,
    productBindings: [...(item.productBindings ?? [])]
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map(mapBinding),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function resolveArchiveItemMasterDataMatch(fields: any[], warnings: any[]) {
  const fieldMatch = fields
    .map((field) => field?.dictionary?.masterDataMatch)
    .find((match) => match?.matched === true);
  if (fieldMatch) {
    return fieldMatch;
  }

  const appliedWarning = warnings.find(
    (warning) => warning?.type === "master_data_attribute_match_applied",
  );
  return appliedWarning?.evidence?.masterDataMatch ?? null;
}

export function mapVersion(
  version: ContractArchiveVersion,
  includeSnapshot: boolean,
) {
  return {
    id: Number(version.id),
    archiveId: Number(version.archiveId),
    version: version.version,
    changeSummary: version.changeSummaryJsonb,
    snapshot: includeSnapshot ? version.snapshotJsonb : undefined,
    editedBy: version.editedBy,
    createdAt: version.createdAt,
  };
}

export function mapProductConfigMatch(binding: ContractArchiveItemProduct) {
  const item = binding.item as ContractArchiveItem;
  const archive = binding.archive as ContractArchive & { document?: Documents };
  return {
    archiveId: Number(archive.id),
    documentId: Number(archive.documentId),
    extractionResultId: Number(archive.extractionResultId),
    fileName: archive.document?.fileName ?? null,
    itemId: Number(item.id),
    itemIndex: item.itemIndex,
    itemName: item.itemName,
    itemProductTypeHint: item.productTypeHint,
    sourceProductNumber: item.sourceProductNumber,
    productBinding: mapBinding(binding),
    customerId: archive.customerId,
    configFields: item.fieldsJsonb,
    erpProduct: binding.erpProductId
      ? {
          id: binding.erpProductId,
          productNumber: binding.productNumber,
          parentProductNumber: binding.erpParentProductNumber,
        }
      : null,
    matchStatus: binding.erpProductId ? "erp_matched" : "archive_only",
  };
}
