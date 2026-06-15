import "../../../config/env.js";
import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { productConfigAgentService } from "../service.js";

function readLimit() {
  const raw = process.env.QUOTE_AGENT_RENORMALIZE_LIMIT;
  const value = raw ? Number(raw) : 20;
  return Number.isFinite(value) && value > 0 ? value : 20;
}

async function main() {
  PgDataSource.setOptions({
    logging: false,
    maxQueryExecutionTime: 0,
  });
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  try {
    const onlyMissingNormalized = process.env.QUOTE_AGENT_RENORMALIZE_ALL !== "1";
    const targetCount = await productConfigAgentService.countRenormalizationTargets({
      onlyMissingNormalized,
    });
    const limit = readLimit();
    console.log(
      `[productConfigAgent:renormalize] targetCount=${targetCount} plannedCount=${Math.min(targetCount, limit)}`,
    );
    const result = await productConfigAgentService.renormalizeExistingExtractions({
      limit,
      onlyMissingNormalized,
    });
    console.log(
      JSON.stringify(
        { targetCount, plannedCount: Math.min(targetCount, limit), ...result },
        null,
        2,
      ),
    );
  } finally {
    await PgDataSource.destroy();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (PgDataSource.isInitialized) {
    await PgDataSource.destroy();
  }
  process.exit(1);
});
