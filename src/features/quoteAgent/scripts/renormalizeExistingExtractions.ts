import "../../../config/env.js";
import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { quoteAgentService } from "../service.js";

function readLimit() {
  const raw = process.env.QUOTE_AGENT_RENORMALIZE_LIMIT;
  const value = raw ? Number(raw) : 20;
  return Number.isFinite(value) && value > 0 ? value : 20;
}

async function main() {
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  try {
    const result = await quoteAgentService.renormalizeExistingExtractions({
      limit: readLimit(),
      onlyMissingNormalized: process.env.QUOTE_AGENT_RENORMALIZE_ALL !== "1",
    });
    console.log(JSON.stringify(result, null, 2));
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
