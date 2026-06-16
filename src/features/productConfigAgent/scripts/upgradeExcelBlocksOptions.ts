import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { buildLlmText } from "../excelParser/index.js";
import {
  makeLlmFriendlyText,
  parseOptionsFromText,
} from "../excelParser/parsers/parseOptions.js";
import { DocumentBlocks } from "../workflow/entity/documentBlocks.entity.js";
import {
  hasArg,
  readApplyFlag,
  readArg,
  readOptionalPositiveIntArg,
} from "./scriptArgs.js";

type ScriptConfig = {
  batchSize: number;
  dryRun: boolean;
  rewriteBlockText: boolean;
  targetParserVersion: string;
  sourceParserVersion: string;
  documentIds: number[] | null;
};

type BlockRow = {
  documentId: number;
  fileName: string | null;
  blocksJson: any;
  parserVersion: string | null;
};

type ScriptStats = {
  total: number;
  scanned: number;
  changed: number;
  unchanged: number;
  persisted: number;
  skippedNoData: number;
  parseFailures: number;
  versionUpgraded: number;
  optionsNormalized: number;
  llmTextRebuilt: number;
  blockTextRewritten: number;
};

type NormalizedBlocksResult = {
  changed: boolean;
  changedByOptions: boolean;
  changedByLlmText: boolean;
  changedByBlockText: boolean;
  changedByVersion: boolean;
  blocksJson: any;
};

function parseDocumentIds(raw?: string): number[] | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isFinite(id) && Number.isInteger(id) && id > 0)
    .filter((id, index, array) => array.indexOf(id) === index);

  return ids.length > 0 ? ids : null;
}

function normalizeOption(option: any) {
  const selected = Boolean(option?.selected);
  const value = `${(option?.value ?? option?.label ?? "").toString()}`.trim();
  const label = `${(option?.label ?? value ?? "").toString()}`.trim();
  return {
    selected,
    label,
    value: value || label,
    normalized: `${selected ? "[SEL]" : "[ ]"} ${value || label}`.trim(),
  };
}

function isPlainOptionList(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
      return "selected" in (item as any) || "label" in (item as any);
    })
  );
}

function ensureCellOptions(rawText: string, existing: any[]) {
  const rawSource = (rawText || "").trim();
  const needReparse =
    !isPlainOptionList(existing) || existing.some((option) => !("value" in (option as any)));

  const sourceOptions = needReparse
    ? parseOptionsFromText(rawSource).options
    : existing;

  return sourceOptions
    .map((option) => normalizeOption(option))
    .filter((option) => option.value);
}

function normalizeRowOptionsFromBlock(block: any) {
  if (!block?.content || !Array.isArray(block.content.cells)) return false;

  let changed = false;
  block.content.cells.forEach((cell: any) => {
    const nextOptions = ensureCellOptions(
      cell.raw_text ?? cell.text ?? "",
      Array.isArray(cell.options) ? cell.options : [],
    );
    if (JSON.stringify(cell.options || []) !== JSON.stringify(nextOptions)) {
      cell.options = nextOptions;
      changed = true;
    }
  });

  return changed;
}

function normalizeBlock(block: any, rewriteBlockText: boolean) {
  if (!block || typeof block !== "object") {
    return {
      changed: false,
      changedByOptions: false,
      changedByBlockText: false,
    };
  }

  let changed = false;
  let changedByOptions = false;
  let changedByBlockText = false;

  if (block.type === "row") {
    if (normalizeRowOptionsFromBlock(block)) {
      changed = true;
      changedByOptions = true;
    }
    return { changed, changedByOptions, changedByBlockText };
  }

  if (block.type !== "cell" && block.type !== "paragraph") {
    return { changed: false, changedByOptions: false, changedByBlockText: false };
  }

  const nextOptions = ensureCellOptions(
    block.raw_text ?? block.text ?? "",
    Array.isArray(block.options) ? block.options : [],
  );
  if (JSON.stringify(block.options || []) !== JSON.stringify(nextOptions)) {
    block.options = nextOptions;
    changed = true;
    changedByOptions = true;
  }

  if (rewriteBlockText) {
    const nextText = makeLlmFriendlyText(block.raw_text ?? block.text ?? "");
    if ((block.text ?? "").trim() !== nextText.trim()) {
      block.text = nextText;
      changed = true;
      changedByBlockText = true;
    }
  }

  return { changed, changedByOptions, changedByBlockText };
}

function normalizeBlocks(
  blocksJson: any,
  rewriteBlockText: boolean,
  targetParserVersion: string,
  sourceParserVersion: string,
): NormalizedBlocksResult {
  const blocks = Array.isArray(blocksJson?.blocks) ? blocksJson.blocks : null;
  if (!Array.isArray(blocks)) {
    return {
      changed: false,
      changedByOptions: false,
      changedByLlmText: false,
      changedByBlockText: false,
      changedByVersion: false,
      blocksJson,
    };
  }

  const nextBlocks = structuredClone(blocks);
  let changedByOptions = false;
  let changedByBlockText = false;

  nextBlocks.forEach((block) => {
    const blockResult = normalizeBlock(block, rewriteBlockText);
    if (!blockResult.changed) return;

    changedByOptions = changedByOptions || blockResult.changedByOptions;
    changedByBlockText = changedByBlockText || blockResult.changedByBlockText;
  });

  const nextBlocksJson = {
    ...blocksJson,
    blocks: nextBlocks,
  };

  const nextLlmText = buildLlmText(
    {
      file_name: blocksJson.file_name,
      source_type: blocksJson.source_type,
      blocks: nextBlocks,
    },
    blocksJson.buildLlmTextOptions,
  );

  const changedByLlmText = nextLlmText !== (blocksJson.llm_text ?? null);
  if (changedByLlmText) {
    nextBlocksJson.llm_text = nextLlmText;
  }

  const currentParserVersion = String(
    blocksJson.parser_version ?? blocksJson.parserVersion ?? sourceParserVersion,
  );
  const changedByVersion = currentParserVersion !== targetParserVersion;
  if (changedByVersion) {
    nextBlocksJson.parser_version = targetParserVersion;
  }

  const changed =
    changedByOptions || changedByLlmText || changedByBlockText || changedByVersion;

  return {
    changed,
    changedByOptions,
    changedByLlmText,
    changedByBlockText,
    changedByVersion,
    blocksJson: nextBlocksJson,
  };
}

async function fetchTargets(config: ScriptConfig): Promise<BlockRow[]> {
  if (!PgDataSource.isInitialized) {
    await PgDataSource.initialize();
    BaseEntity.useDataSource(PgDataSource);
  }

  if (config.documentIds && config.documentIds.length > 0) {
    const rows = await PgDataSource.query(
      `
        SELECT
          db.document_id AS "documentId",
          d.file_name AS "fileName",
          db.blocks_json AS "blocksJson",
          db.parser_version AS "parserVersion"
        FROM quote_agent.document_blocks db
        JOIN quote_agent.documents d ON d.id = db.document_id
        WHERE db.document_id = ANY($1::int[])
        ORDER BY db.document_id ASC
      `,
      [config.documentIds],
    );
    return rows as BlockRow[];
  }

  const rows = await PgDataSource.query(
    `
      SELECT
        db.document_id AS "documentId",
        d.file_name AS "fileName",
        db.blocks_json AS "blocksJson",
        db.parser_version AS "parserVersion"
      FROM quote_agent.document_blocks db
      JOIN quote_agent.documents d ON d.id = db.document_id
      WHERE COALESCE(db.parser_version, 'v1') = $1
      ORDER BY db.document_id ASC
    `,
    [config.sourceParserVersion],
  );
  return rows as BlockRow[];
}

async function ensureDataSourceInitialized() {
  if (!PgDataSource.isInitialized) {
    await PgDataSource.initialize();
    BaseEntity.useDataSource(PgDataSource);
  }
}

async function reconnectDataSource() {
  if (PgDataSource.isInitialized) {
    await PgDataSource.destroy();
  }
  await ensureDataSourceInitialized();
}

function isConnectionTerminatedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Connection terminated unexpectedly/i.test(message);
}

async function persistBlocksBatch(
  updates: Array<{
    documentId: number;
    blocksJson: any;
    parserVersion?: string;
  }>,
) {
  if (updates.length === 0) return;

  await ensureDataSourceInitialized();
  const repo = PgDataSource.getRepository(DocumentBlocks);
  await repo.upsert(
    updates.map((item) => ({
      documentId: item.documentId,
      blocksJson: item.blocksJson,
      parserVersion: item.parserVersion,
    })) as any,
    {
      conflictPaths: ["documentId"],
      skipUpdateIfNoValuesChanged: true,
    },
  );
}

async function persistBlocksBatchWithRetry(
  updates: Array<{
    documentId: number;
    blocksJson: any;
    parserVersion?: string;
  }>,
) {
  try {
    await persistBlocksBatch(updates);
  } catch (error) {
    if (!isConnectionTerminatedError(error)) {
      throw error;
    }

    console.warn("数据库连接中断，正在重连并重试当前批次一次");
    await reconnectDataSource();
    await persistBlocksBatch(updates);
  }
}

async function main() {
  const apply = readApplyFlag();
  const config: ScriptConfig = {
    dryRun: !apply || hasArg("dryRun"),
    rewriteBlockText: hasArg("rewriteBlockText"),
    batchSize: readOptionalPositiveIntArg("batchSize", 100) || 100,
    targetParserVersion: readArg("targetParserVersion") || readArg("parserVersion") || "v2",
    sourceParserVersion: readArg("sourceParserVersion") || "v1",
    documentIds: parseDocumentIds(readArg("documentIds")),
  };

  const batchSize = config.batchSize;
  const stats: ScriptStats = {
    total: 0,
    scanned: 0,
    changed: 0,
    unchanged: 0,
    persisted: 0,
    skippedNoData: 0,
    parseFailures: 0,
    versionUpgraded: 0,
    optionsNormalized: 0,
    llmTextRebuilt: 0,
    blockTextRewritten: 0,
  };

  console.log("配置:");
  console.log(
    JSON.stringify(
      {
        apply,
        dryRun: config.dryRun,
        batchSize: config.batchSize,
        rewriteBlockText: config.rewriteBlockText,
        targetParserVersion: config.targetParserVersion,
        sourceParserVersion: config.sourceParserVersion,
        documentIds: config.documentIds,
      },
      null,
      2,
    ),
  );
  console.log(
    "执行阶段：1) 标准化 options(value/selected/label/normalized) 2) 重建 llm_text 3) rewriteBlockText（可选）",
  );

  try {
    const targets = await fetchTargets(config);
    stats.total = targets.length;
    console.log(`扫描到 ${stats.total} 条记录`);

    for (let index = 0; index < targets.length; index += batchSize) {
      const batch = targets.slice(index, index + batchSize);
      const updates: {
        documentId: number;
        blocksJson: any;
        parserVersion?: string;
      }[] = [];

      for (const row of batch) {
        try {
          const source = row.blocksJson;
          stats.scanned += 1;

          if (!source || typeof source !== "object") {
            stats.skippedNoData += 1;
            continue;
          }

          const normalized = normalizeBlocks(
            source,
            config.rewriteBlockText,
            config.targetParserVersion,
            config.sourceParserVersion,
          );

          if (!normalized.changed) {
            stats.unchanged += 1;
            continue;
          }

          if (normalized.changedByOptions) {
            stats.optionsNormalized += 1;
          }
          if (normalized.changedByLlmText) {
            stats.llmTextRebuilt += 1;
          }
          if (normalized.changedByBlockText) {
            stats.blockTextRewritten += 1;
          }
          if (normalized.changedByVersion) {
            stats.versionUpgraded += 1;
          }

          updates.push({
            documentId: row.documentId,
            blocksJson: normalized.blocksJson,
            parserVersion: config.targetParserVersion,
          });
          stats.changed += 1;
        } catch (error) {
          stats.parseFailures += 1;
          console.error(
            `解析失败 documentId=${row.documentId}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      if (!config.dryRun && updates.length > 0) {
        await persistBlocksBatchWithRetry(updates);
        stats.persisted += updates.length;
      }

      console.log(
        `处理区间 [${index + 1}..${Math.min(index + batchSize, stats.scanned)}] ` +
          `变更=${updates.length} 实际入库=${config.dryRun ? 0 : updates.length}`,
      );
    }

    console.log("完成:");
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    if (PgDataSource.isInitialized) {
      await PgDataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
