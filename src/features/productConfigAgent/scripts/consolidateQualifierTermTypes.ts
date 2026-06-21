import "../../../config/env.js";
import "reflect-metadata";
import { BaseEntity, type EntityManager } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { DictionaryService } from "../dictionary/dictionary.service.js";
import { incrementDictionaryVersion } from "../dictionary/dictionaryVersion.service.js";
import { normalizeText } from "../dictionary/dictionary.utils.js";
import { productConfigAgentService } from "../service.js";

const TARGET_PROMPT_VERSION =
  "v3-plan-item-20260616-cross-concept-20260621";

const CONSOLIDATIONS = [
  { source: "side_plate_heating_config", target: "heating_config", qualifier: "area=side_plate" },
  { source: "die_lip_heating_config", target: "heating_config", qualifier: "area=lip" },
  { source: "pump_heating_voltage", target: "heating_voltage", qualifier: "area=pump" },
  { source: "side_plate_material", target: "product_material", qualifier: "area=side_plate" },
  { source: "side_plate_connector", target: "connector_config", qualifier: "area=side_plate" },
  { source: "lower_lip_gap", target: "lip_gap", qualifier: "position=lower_die,area=lip" },
] as const;

const TERM_TYPE_ALIASES: Record<string, string[]> = {
  heating_config: [
    "加热配置",
    "侧板加热",
    "两侧板加热",
    "侧板加热配置",
    "两侧板有加热",
    "两侧板加热配置",
    "模唇加热",
    "模唇加热配置",
  ],
  heating_voltage: ["泵体加热电压", "计量泵加热电压"],
  product_material: ["侧板材质", "两侧板材质"],
  connector_config: ["侧板接插件", "两侧板接插件"],
  lip_gap: ["下模唇开档", "唇开档"],
  capacity: ["总挤出量", "产量范围", "常规产量"],
};

const VALUE_IMPORTS: Record<string, string[]> = {
  plastic_material: ["BOPET", "BOPE", "TPU", "CPVC", "XPE", "IXPE", "软PVC", "软质PVC"],
  application: [
    "光学级",
    "弹性体",
    "交联化学发泡",
    "做服装用",
    "湿法隔膜",
    "电容膜",
    "热收缩膜",
    "电子产品",
    "锂离子电池隔离膜",
    "地板革",
  ],
  precision_grade: ["S级"],
  product_material: ["3Cr13", "2311A钢材"],
  flow_channel_type: ["衣架式"],
  connector_type: ["法兰"],
  heating_method: ["油加温"],
};

const VALUE_ALIASES: Array<{ termType: string; canonicalValue: string; alias: string }> = [
  { termType: "precision_grade", canonicalValue: "S级", alias: "S级标准" },
  { termType: "heating_method", canonicalValue: "油加温", alias: "模唇油加温" },
];

function applyRequested(): boolean {
  return process.argv.includes("--apply");
}

function requestedExtractionId(): number | undefined {
  const arg = process.argv.find((item) => item.startsWith("--extraction-id="));
  if (!arg) return undefined;
  const value = Number(arg.slice("--extraction-id=".length));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--extraction-id must be a positive integer");
  }
  return value;
}

async function audit() {
  const sourceTerms = CONSOLIDATIONS.map((item) => item.source);
  const targetTerms = CONSOLIDATIONS.map((item) => item.target);
  const [mappings, embeddedQualifierTerms, targetStatus] = await Promise.all([
    PgDataSource.query(
      `
      SELECT
        source.term_type AS "sourceTermType",
        source.display_name AS "sourceDisplayName",
        source.value_kind AS "sourceValueKind",
        source.is_active AS "sourceActive",
        target.term_type AS "targetTermType",
        target.display_name AS "targetDisplayName",
        target.value_kind AS "targetValueKind",
        target.is_active AS "targetActive",
        (SELECT COUNT(*)::int FROM quote_agent.dictionary_term_type_aliases alias
          WHERE alias.term_type = source.term_type AND alias.is_active) AS "aliasCount",
        (SELECT COUNT(*)::int FROM quote_agent.dictionary_term_type_candidates candidate
          WHERE candidate.status = 'pending' AND candidate.proposed_term_type = source.term_type) AS "pendingCandidateCount",
        (SELECT COUNT(*)::int
          FROM quote_agent.extraction_results extraction
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(extraction.normalized_extraction_json->'items','[]')) item
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(item->'fields','[]')) field
          WHERE extraction.status='normalized'
            AND field->'dictionary'->>'term_type'=source.term_type) AS "historicalFieldCount"
      FROM quote_agent.dictionary_term_types source
      LEFT JOIN quote_agent.dictionary_term_types target
        ON target.term_type = ANY($2::text[])
       AND target.term_type = CASE source.term_type
         WHEN 'side_plate_heating_config' THEN 'heating_config'
         WHEN 'die_lip_heating_config' THEN 'heating_config'
         WHEN 'pump_heating_voltage' THEN 'heating_voltage'
         WHEN 'side_plate_material' THEN 'product_material'
         WHEN 'side_plate_connector' THEN 'connector_config'
         WHEN 'lower_lip_gap' THEN 'lip_gap'
       END
      WHERE source.term_type = ANY($1::text[])
      ORDER BY source.term_type
      `,
      [sourceTerms, targetTerms],
    ),
    PgDataSource.query(`
      SELECT term_type AS "termType", display_name AS "displayName",
        value_kind AS "valueKind", applicable_product_types AS "applicableProductTypes"
      FROM quote_agent.dictionary_term_types
      WHERE is_active AND display_name ~
        '(上模|下模|模唇|模体|侧板|流道|外表面|泵前|泵后|网前|网后|入口|进料口|连接器|接插件|镶块|分配器|合流器|泵体)'
      ORDER BY display_name
    `),
    PgDataSource.query(
      `SELECT status, COUNT(*)::int AS count
       FROM quote_agent.extraction_results
       WHERE prompt_version=$1 GROUP BY status ORDER BY status`,
      [TARGET_PROMPT_VERSION],
    ),
  ]);
  return { mappings, embeddedQualifierTerms, targetStatus };
}

async function prepareDictionary(): Promise<number> {
  return PgDataSource.transaction(async (manager) => {
    await manager.query(`
      INSERT INTO quote_agent.dictionary_term_types(
        term_type, display_name, description, category, value_kind, scope,
        concept_role, risk_level, baseline_trust_tier, baseline_risk_labels,
        sort_order, applicable_product_types, is_active
      ) VALUES (
        'heating_config', '加热配置', '是否配置加热；具体部位由 qualifier 表达。',
        'heating', 'boolean', 'item', 'config_attribute', 'normal',
        'trusted', '[]'::jsonb, 100, '["common"]'::jsonb, true
      )
      ON CONFLICT(term_type) DO UPDATE SET
        display_name=EXCLUDED.display_name,
        description=EXCLUDED.description,
        value_kind=EXCLUDED.value_kind,
        applicable_product_types=EXCLUDED.applicable_product_types,
        is_active=true,
        updated_at=now()
    `);

    for (const { source, target } of CONSOLIDATIONS) {
      await manager.query(
        `UPDATE quote_agent.dictionary_term_type_aliases
         SET term_type=$2, source='qualifier_term_consolidation', updated_at=now()
         WHERE term_type=$1`,
        [source, target],
      );
    }
    for (const [termType, aliases] of Object.entries(TERM_TYPE_ALIASES)) {
      for (const alias of aliases) await upsertTermTypeAlias(manager, termType, alias);
    }
    for (const [termType, values] of Object.entries(VALUE_IMPORTS)) {
      for (const value of values) await upsertValue(manager, termType, value);
    }
    for (const alias of VALUE_ALIASES) await upsertValueAlias(manager, alias);
    return incrementDictionaryVersion(manager);
  });
}

async function upsertTermTypeAlias(
  manager: EntityManager,
  termType: string,
  alias: string,
) {
  await manager.query(
    `INSERT INTO quote_agent.dictionary_term_type_aliases(
       term_type,alias_name,normalized_alias_name,description,source,
       usage_count,baseline_trust_tier,baseline_risk_labels,is_active)
     VALUES($1,$2,$3,$4,'qualifier_term_consolidation',0,'trusted','[]'::jsonb,true)
     ON CONFLICT(normalized_alias_name) DO UPDATE SET
       term_type=EXCLUDED.term_type,alias_name=EXCLUDED.alias_name,
       source=EXCLUDED.source,is_active=true,updated_at=now()`,
    [termType, alias, normalizeText(alias), `Alias consolidated into ${termType}`],
  );
}

async function upsertValue(manager: EntityManager, termType: string, value: string) {
  const rows = await manager.query(
    `INSERT INTO quote_agent.dictionary_terms(
       term_type,canonical_value,display_name,description,scope,concept_role,
       risk_level,baseline_trust_tier,baseline_risk_labels,is_active)
     VALUES($1,$2,$2,'Approved business vocabulary','value','enum_value',
       'normal','trusted','[]'::jsonb,true)
     ON CONFLICT(term_type,canonical_value) DO UPDATE SET
       display_name=EXCLUDED.display_name,is_active=true,updated_at=now()
     RETURNING id`,
    [termType, value],
  );
  await upsertValueAlias(manager, {
    termType,
    canonicalValue: value,
    alias: value,
    termId: String(rows[0].id),
  });
}

async function upsertValueAlias(
  manager: EntityManager,
  params: { termType: string; canonicalValue: string; alias: string; termId?: string },
) {
  const termId = params.termId ?? String((await manager.query(
    `SELECT id FROM quote_agent.dictionary_terms
     WHERE term_type=$1 AND canonical_value=$2`,
    [params.termType, params.canonicalValue],
  ))[0]?.id ?? "");
  if (!termId) throw new Error(`Dictionary term missing: ${params.termType}:${params.canonicalValue}`);
  await manager.query(
    `INSERT INTO quote_agent.dictionary_aliases(
       term_id,term_type,alias_value,normalized_alias,confidence,source,
       usage_count,risk_level,baseline_trust_tier,baseline_risk_labels,is_active)
     VALUES($1,$2,$3,$4,1,'qualifier_term_consolidation',0,'normal','trusted','[]'::jsonb,true)
     ON CONFLICT(term_type,normalized_alias) DO UPDATE SET
       term_id=EXCLUDED.term_id,alias_value=EXCLUDED.alias_value,
       confidence=1,source=EXCLUDED.source,is_active=true,updated_at=now()`,
    [termId, params.termType, params.alias, normalizeText(params.alias)],
  );
}

async function renormalizeTargets() {
  const extractionId = requestedExtractionId();
  const rows = await PgDataSource.query(
    `SELECT id::int AS id FROM quote_agent.extraction_results
     WHERE prompt_version=$1 AND status='normalized'
       AND ($2::int IS NULL OR id=$2)
     ORDER BY id`,
    [TARGET_PROMPT_VERSION, extractionId ?? null],
  );
  const results: Array<{ id: number; status: "ok" | "failed"; error?: string }> = [];
  for (const [index, row] of rows.entries()) {
    try {
      await productConfigAgentService.generateDictionaryForExtractionId(row.id);
      results.push({ id: row.id, status: "ok" });
    } catch (error) {
      results.push({
        id: row.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if ((index + 1) % 10 === 0 || index + 1 === rows.length) {
      console.log(`[qualifier-consolidation] renormalized ${index + 1}/${rows.length}`);
    }
  }
  return results;
}

async function verifyTargets() {
  return PgDataSource.query(
    `SELECT field->'dictionary'->>'term_type' AS "termType",COUNT(*)::int AS count
     FROM quote_agent.extraction_results extraction
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(extraction.normalized_extraction_json->'items','[]')) item
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(item->'fields','[]')) field
     WHERE extraction.prompt_version=$1 AND extraction.status='normalized'
       AND field->'dictionary'->>'term_type'=ANY($2::text[])
     GROUP BY 1 ORDER BY 1`,
    [TARGET_PROMPT_VERSION, CONSOLIDATIONS.map((item) => item.source)],
  );
}

async function disableSources(): Promise<number> {
  return PgDataSource.transaction(async (manager) => {
    await manager.query(
      `UPDATE quote_agent.dictionary_term_types SET is_active=false,updated_at=now()
       WHERE term_type=ANY($1::text[])`,
      [CONSOLIDATIONS.map((item) => item.source)],
    );
    return incrementDictionaryVersion(manager);
  });
}

async function pendingCounts() {
  return {
    value: Number((await PgDataSource.query(
      `SELECT COUNT(*)::int AS count FROM quote_agent.dictionary_candidates WHERE status='pending'`,
    ))[0].count),
    termType: Number((await PgDataSource.query(
      `SELECT COUNT(*)::int AS count FROM quote_agent.dictionary_term_type_candidates WHERE status='pending'`,
    ))[0].count),
  };
}

async function main() {
  PgDataSource.setOptions({ logging: false, maxQueryExecutionTime: 0 });
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);
  try {
    const beforeAudit = await audit();
    const beforeCandidates = await pendingCounts();
    if (!applyRequested()) {
      console.log(JSON.stringify({ mode: "audit", apply: false, beforeAudit, beforeCandidates }, null, 2));
      return;
    }

    const preparedDictionaryVersion = await prepareDictionary();
    await new DictionaryService(PgDataSource).reloadCache();
    const normalization = await renormalizeTargets();
    const failed = normalization.filter((item) => item.status === "failed");
    if (failed.length > 0) {
      throw new Error(`Renormalization failed for ${failed.length} extractions: ${JSON.stringify(failed.slice(0, 10))}`);
    }
    const remainingOldReferences = await verifyTargets();
    if (remainingOldReferences.length > 0) {
      throw new Error(`Old term types remain in target results: ${JSON.stringify(remainingOldReferences)}`);
    }

    const finalizedDictionaryVersion = await disableSources();
    const dictionaryService = new DictionaryService(PgDataSource);
    await dictionaryService.reloadCache();
    const recheck = await dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate({ limit: 5000 });
    const afterCandidates = await pendingCounts();
    const afterAudit = await audit();
    console.log(JSON.stringify({
      mode: "apply",
      preparedDictionaryVersion,
      finalizedDictionaryVersion,
      normalizedCount: normalization.length,
      remainingOldReferences,
      beforeCandidates,
      afterCandidates,
      recheck,
      beforeAudit,
      afterAudit,
      manualReviewValues: { plastic_material: ["BOPETG"] },
    }, null, 2));
  } finally {
    await PgDataSource.destroy();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (PgDataSource.isInitialized) await PgDataSource.destroy();
  process.exit(1);
});
