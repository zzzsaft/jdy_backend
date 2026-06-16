import crypto from "node:crypto";

export type DuplicateDocumentCandidate = {
  documentId: number;
  fileName: string;
  fileHash: string;
  filePath: string;
  source?: string | null;
  status?: string | null;
  createdAt?: Date | string | null;
  blocksId?: number | null;
  blocksJson?: any;
  latestExtractionId?: number | null;
  latestExtractionStatus?: string | null;
  latestExtractionCreatedAt?: Date | string | null;
};

export type DuplicateDocumentReportItem = Omit<
  DuplicateDocumentCandidate,
  "blocksJson"
> & {
  contentHash?: string;
};

export type DocumentDuplicateMapping = {
  duplicateDocumentId: number;
  canonicalDocumentId: number;
  reason: "same_file_name_same_content";
  contentHash: string;
};

export type DuplicateDocumentGroupReport = {
  fileName: string;
  classification: "same_content" | "different_content" | "missing_blocks";
  canonicalDocumentId?: number;
  contentHash?: string;
  documents: DuplicateDocumentReportItem[];
  duplicateMappings: DocumentDuplicateMapping[];
};

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function blockText(block: any): string {
  if (!block || typeof block !== "object") return stableStringify(block);

  const source = block.source && typeof block.source === "object"
    ? block.source
    : {};
  const text =
    block.raw_text ??
    block.text ??
    block.value ??
    block.content ??
    block.llm_text ??
    "";

  return [
    source.sheet_name ?? source.sheetName ?? "",
    source.cell ?? "",
    source.row ?? "",
    source.col ?? "",
    text,
  ].map((item) => String(item ?? "")).join("\t");
}

export function getDocumentBlocksContentText(blocksJson: any): string {
  if (!blocksJson || typeof blocksJson !== "object") return "";

  if (typeof blocksJson.llm_text === "string" && blocksJson.llm_text.trim()) {
    return normalizeText(blocksJson.llm_text);
  }

  if (Array.isArray(blocksJson.blocks)) {
    return normalizeText(blocksJson.blocks.map(blockText).join("\n"));
  }

  return normalizeText(
    stableStringify({
      sheets: blocksJson.sheets,
      tables: blocksJson.tables,
      textBlocks: blocksJson.textBlocks,
      blocks: blocksJson.blocks,
    }),
  );
}

export function calculateDocumentContentHash(blocksJson: any): string | null {
  const contentText = getDocumentBlocksContentText(blocksJson);
  if (!contentText) return null;

  return crypto.createHash("sha256").update(contentText).digest("hex");
}

function extractionRank(document: DuplicateDocumentCandidate) {
  if (document.latestExtractionStatus === "normalized") return 0;
  if (document.latestExtractionStatus === "parsed") return 1;
  if (document.latestExtractionId) return 2;
  return 3;
}

export function chooseCanonicalDocument(
  documents: DuplicateDocumentCandidate[],
): DuplicateDocumentCandidate {
  return [...documents].sort((a, b) => {
    const rankDelta = extractionRank(a) - extractionRank(b);
    if (rankDelta !== 0) return rankDelta;
    return Number(a.documentId) - Number(b.documentId);
  })[0];
}

function toReportItem(
  document: DuplicateDocumentCandidate,
  contentHash?: string,
): DuplicateDocumentReportItem {
  const { blocksJson: _blocksJson, ...rest } = document;
  return { ...rest, contentHash };
}

export function buildDuplicateDocumentReport(
  candidates: DuplicateDocumentCandidate[],
): DuplicateDocumentGroupReport[] {
  const byFileName = new Map<string, DuplicateDocumentCandidate[]>();
  for (const candidate of candidates) {
    const records = byFileName.get(candidate.fileName) ?? [];
    records.push(candidate);
    byFileName.set(candidate.fileName, records);
  }

  const reports: DuplicateDocumentGroupReport[] = [];
  for (const [fileName, documents] of byFileName) {
    const hashByDocumentId = new Map<number, string>();
    const missingBlocks = documents.filter((document) => {
      const contentHash = calculateDocumentContentHash(document.blocksJson);
      if (contentHash) hashByDocumentId.set(document.documentId, contentHash);
      return !document.blocksId || !contentHash;
    });

    if (missingBlocks.length > 0) {
      reports.push({
        fileName,
        classification: "missing_blocks",
        documents: documents.map((document) =>
          toReportItem(document, hashByDocumentId.get(document.documentId)),
        ),
        duplicateMappings: [],
      });
      continue;
    }

    const byContentHash = new Map<string, DuplicateDocumentCandidate[]>();
    for (const document of documents) {
      const contentHash = hashByDocumentId.get(document.documentId);
      if (!contentHash) continue;
      const records = byContentHash.get(contentHash) ?? [];
      records.push(document);
      byContentHash.set(contentHash, records);
    }

    if (byContentHash.size > 1) {
      reports.push({
        fileName,
        classification: "different_content",
        documents: documents.map((document) =>
          toReportItem(document, hashByDocumentId.get(document.documentId)),
        ),
        duplicateMappings: [],
      });
    }

    for (const [contentHash, sameContentDocuments] of byContentHash) {
      if (sameContentDocuments.length < 2) continue;

      const canonical = chooseCanonicalDocument(sameContentDocuments);
      const duplicateMappings = sameContentDocuments
        .filter((document) => document.documentId !== canonical.documentId)
        .map((document) => ({
          duplicateDocumentId: document.documentId,
          canonicalDocumentId: canonical.documentId,
          reason: "same_file_name_same_content" as const,
          contentHash,
        }));

      reports.push({
        fileName,
        classification: "same_content",
        canonicalDocumentId: canonical.documentId,
        contentHash,
        documents: sameContentDocuments.map((document) =>
          toReportItem(document, contentHash),
        ),
        duplicateMappings,
      });
    }
  }

  return reports.sort((a, b) => {
    const fileNameDelta = a.fileName.localeCompare(b.fileName, "zh-CN");
    if (fileNameDelta !== 0) return fileNameDelta;
    return a.classification.localeCompare(b.classification);
  });
}
