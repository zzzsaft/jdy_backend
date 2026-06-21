import type { DataSource, EntityManager } from "typeorm";
import { DictionaryVersion } from "./entity/index.js";

type DictionaryVersionStore = DataSource | EntityManager;

export async function readDictionaryVersionValue(
  store: DictionaryVersionStore,
): Promise<string | null> {
  const version = await store
    .getRepository(DictionaryVersion)
    .findOne({ where: { versionKey: "dictionary" } });
  return version?.versionValue ?? null;
}

export async function readDictionaryVersion(
  store: DictionaryVersionStore,
  fallback = 0,
): Promise<number> {
  return Number((await readDictionaryVersionValue(store)) ?? fallback);
}

export async function incrementDictionaryVersion(
  store: DictionaryVersionStore,
): Promise<number> {
  const rows = await store.query(
    `
    INSERT INTO quote_agent.dictionary_versions(version_key, version_value)
    VALUES ($1, 1)
    ON CONFLICT(version_key)
    DO UPDATE SET
      version_value = quote_agent.dictionary_versions.version_value + 1,
      updated_at = now()
    RETURNING version_value AS "versionValue"
    `,
    ["dictionary"],
  );
  return Number(rows?.[0]?.versionValue ?? 0);
}
