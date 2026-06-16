import { PgDataSource } from "../build/src/config/data-source.js";
import { DictionaryService } from "../build/src/features/productConfigAgent/dictionary/dictionary.service.js";
import { normalizeText } from "../build/src/features/productConfigAgent/dictionary/dictionary.utils.js";

const REVIEWED_BY = "codex";

async function main() {
  await PgDataSource.initialize();
  const mode = process.argv[2] ?? "summary";

  const counts = await PgDataSource.query(`
    SELECT 'term_type' AS type, count(*)::int
    FROM quote_agent.dictionary_term_type_candidates
    WHERE status = 'pending'
    UNION ALL
    SELECT 'value' AS type, count(*)::int
    FROM quote_agent.dictionary_candidates
    WHERE status = 'pending'
  `);

  const productTypes = await PgDataSource.query(`
    SELECT id, canonical_value, display_name
    FROM quote_agent.dictionary_terms
    WHERE term_type = 'product_type'
      AND is_active = true
    ORDER BY display_name
  `);

  const clusters = await PgDataSource.query(`
    WITH term_type_clusters AS (
      SELECT
        'term_type' AS candidate_type,
        source_product_type,
        normalized_field_name AS key1,
        NULL::text AS key2,
        reason,
        array_agg(id ORDER BY id) AS ids,
        array_agg(DISTINCT raw_field_name) AS raw_fields,
        array_agg(DISTINCT raw_value) FILTER (WHERE raw_value IS NOT NULL) AS raw_values,
        count(*)::int AS cnt
      FROM quote_agent.dictionary_term_type_candidates
      WHERE status = 'pending'
      GROUP BY source_product_type, normalized_field_name, reason
    ),
    value_clusters AS (
      SELECT
        'value' AS candidate_type,
        source_product_type,
        term_type AS key1,
        normalized_raw_value AS key2,
        reason,
        array_agg(id ORDER BY id) AS ids,
        NULL::text[] AS raw_fields,
        array_agg(DISTINCT raw_value) AS raw_values,
        count(*)::int AS cnt
      FROM quote_agent.dictionary_candidates
      WHERE status = 'pending'
      GROUP BY source_product_type, term_type, normalized_raw_value, reason
    )
    SELECT *
    FROM (
      SELECT * FROM term_type_clusters
      UNION ALL
      SELECT * FROM value_clusters
    ) clusters
    ORDER BY cnt DESC, candidate_type, key1
  `);

  const suggestions = await PgDataSource.query(`
    SELECT candidate_type, candidate_id, recommended_action, confidence, suggestion, model
    FROM quote_agent.dictionary_candidate_review_suggestions
    WHERE (candidate_type, candidate_id) IN (
      SELECT 'term_type', id FROM quote_agent.dictionary_term_type_candidates WHERE status = 'pending'
      UNION ALL
      SELECT 'value', id FROM quote_agent.dictionary_candidates WHERE status = 'pending'
    )
    ORDER BY candidate_type, candidate_id, updated_at DESC
  `);

  if (mode === "clusters") {
    console.log(JSON.stringify({ counts, productTypes, clusterCount: clusters.length, clusters, suggestions }, null, 2));
    return;
  }

  if (mode === "value-meta") {
    const valueTermTypes = await PgDataSource.query(`
      SELECT term_type, display_name, value_kind, applicable_product_types
      FROM quote_agent.dictionary_term_types
      WHERE term_type IN (
        SELECT DISTINCT term_type
        FROM quote_agent.dictionary_candidates
        WHERE status = 'pending'
      )
      ORDER BY term_type
    `);
    const productTypeAliases = await PgDataSource.query(`
      SELECT terms.canonical_value, aliases.alias_value, aliases.normalized_alias
      FROM quote_agent.dictionary_aliases aliases
      JOIN quote_agent.dictionary_terms terms ON terms.id = aliases.term_id
      WHERE aliases.term_type = 'product_type'
        AND aliases.is_active = true
      ORDER BY terms.canonical_value, aliases.alias_value
    `);
    console.log(JSON.stringify({ valueTermTypes, productTypeAliases }, null, 2));
    return;
  }

  if (mode === "find") {
    const patterns = process.argv.slice(3);
    const rows = await PgDataSource.query(
      `
      SELECT term_type, display_name, value_kind, applicable_product_types
      FROM quote_agent.dictionary_term_types
      WHERE is_active = true
        AND (
          term_type ILIKE ANY($1::text[])
          OR display_name ILIKE ANY($1::text[])
        )
      ORDER BY sort_order, term_type
      `,
      [patterns.map((item) => `%${item}%`)],
    );
    console.log(JSON.stringify({ patterns, rows }, null, 2));
    return;
  }

  if (mode === "values") {
    const termType = process.argv[3];
    const rows = await PgDataSource.query(
      `
      SELECT terms.id, terms.term_type, terms.canonical_value, terms.display_name,
             array_agg(aliases.alias_value ORDER BY aliases.alias_value)
               FILTER (WHERE aliases.id IS NOT NULL) AS aliases
      FROM quote_agent.dictionary_terms terms
      LEFT JOIN quote_agent.dictionary_aliases aliases
        ON aliases.term_id = terms.id
       AND aliases.is_active = true
      WHERE terms.is_active = true
        AND terms.term_type = $1
      GROUP BY terms.id
      ORDER BY terms.canonical_value
      `,
      [termType],
    );
    console.log(JSON.stringify({ termType, rows }, null, 2));
    return;
  }

  if (mode === "apply") {
    const dictionaryService = new DictionaryService(PgDataSource);
    const results = [];

    async function record(label, action) {
      try {
        await action();
        results.push({ label, status: "ok" });
      } catch (error) {
        results.push({
          label,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    async function ensureProductType({ canonicalValue, displayName, aliases }) {
      await PgDataSource.query(
        `
        INSERT INTO quote_agent.dictionary_terms(term_type, canonical_value, display_name, description, is_active, created_at, updated_at)
        VALUES ('product_type', $1, $2, NULL, true, now(), now())
        ON CONFLICT (term_type, canonical_value)
        DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true, updated_at = now()
        `,
        [canonicalValue, displayName],
      );
      const [term] = await PgDataSource.query(
        `
        SELECT id
        FROM quote_agent.dictionary_terms
        WHERE term_type = 'product_type'
          AND canonical_value = $1
        `,
        [canonicalValue],
      );
      for (const alias of aliases) {
        await PgDataSource.query(
          `
          INSERT INTO quote_agent.dictionary_aliases(
            term_id, term_type, alias_value, normalized_alias, confidence, source,
            usage_count, last_seen_at, risk_level, note, is_active, created_at, updated_at
          )
          VALUES ($1, 'product_type', $2, $3, 1.0, 'candidate_review', 0, NULL, 'normal', NULL, true, now(), now())
          ON CONFLICT (term_type, normalized_alias)
          DO UPDATE SET term_id = EXCLUDED.term_id, alias_value = EXCLUDED.alias_value,
                        source = EXCLUDED.source, risk_level = EXCLUDED.risk_level,
                        is_active = true, updated_at = now()
          `,
          [term.id, alias, normalizeText(alias)],
        );
      }
    }

    async function termId(termType, canonicalValue) {
      const [term] = await PgDataSource.query(
        `
        SELECT id
        FROM quote_agent.dictionary_terms
        WHERE term_type = $1
          AND canonical_value = $2
          AND is_active = true
        `,
        [termType, canonicalValue],
      );
      if (!term) {
        throw new Error(`Dictionary term not found: ${termType}:${canonicalValue}`);
      }
      return String(term.id);
    }

    await record("ensure product_type:sizing_die", () =>
      ensureProductType({
        canonicalValue: "sizing_die",
        displayName: "定型模",
        aliases: ["sizing_die", "定型模", "二级定型模"],
      }),
    );

    const approveTerm = (candidateId, termType, extra = {}) =>
      record(`term ${candidateId} -> ${termType}`, () =>
        dictionaryService.approveTermTypeCandidateAsAlias({
          candidateId,
          termType,
          reviewedBy: REVIEWED_BY,
          bumpVersion: false,
          ...extra,
        }),
      );
    const createTerm = (candidateId, params) =>
      record(`term ${candidateId} create ${params.termType}`, () =>
        dictionaryService.createTermTypeFromCandidate({
          candidateId,
          reviewedBy: REVIEWED_BY,
          category: "product_config",
          sortOrder: 100,
          bumpVersion: false,
          ...params,
        }),
      );
    const splitTerm = (candidateId, splits) =>
      record(`term ${candidateId} split`, () =>
        dictionaryService.splitTermTypeCandidate({
          candidateId,
          splits,
          reviewedBy: REVIEWED_BY,
          bumpVersion: false,
        }),
      );
    const approveValue = (candidateId, targetTermId, aliasNames = []) =>
      record(`value ${candidateId} -> term ${targetTermId}`, () =>
        dictionaryService.approveValueCandidateAsAlias({
          candidateId,
          termId: targetTermId,
          aliasNames,
          reviewedBy: REVIEWED_BY,
          bumpVersion: false,
        }),
      );
    const createValue = (candidateId, params) =>
      record(`value ${candidateId} create ${params.canonicalValue}`, () =>
        dictionaryService.createValueFromCandidate({
          candidateId,
          reviewedBy: REVIEWED_BY,
          bumpVersion: false,
          ...params,
        }),
      );
    const rejectValue = (candidateId, reason) =>
      record(`value ${candidateId} reject`, () =>
        dictionaryService.rejectValueCandidate({
          candidateId,
          reviewedBy: REVIEWED_BY,
          reason,
        }),
      );

    await approveTerm("177", "reference_product");
    await createTerm("97", {
      termType: "transmission_system_config",
      displayName: "传动系统配置",
      description: "计量泵传动系统相关配置项，例如万向传动轴、减速箱等。",
      valueKind: "enums",
      applicableProductTypes: ["metering_pump"],
      valueCanonicalValue: "universal_drive_shaft",
      valueDisplayName: "万向传动轴",
      valueAliasNames: ["万向传动轴"],
    });
    await approveTerm("215", "option");
    await createTerm("219", {
      termType: "lifting_hole_specification",
      displayName: "吊装孔规格",
      description: "吊装孔规格、中心距或图纸说明。",
      valueKind: "text",
      applicableProductTypes: ["common"],
    });
    await createTerm("129", {
      termType: "single_side_deckle_width",
      displayName: "单边挡块宽度",
      description: "平模头单边挡块或堵边宽度。",
      valueKind: "number_unit",
      applicableProductTypes: ["flat_die"],
    });
    await approveTerm("168", "pressure_sensor_hole_config", { appendApplicableProductType: true });
    await createTerm("197", {
      termType: "material_formula",
      displayName: "原料配方",
      description: "客户提供的原料配比或配方说明。",
      valueKind: "text",
      applicableProductTypes: ["common"],
    });
    await createTerm("220", {
      termType: "lifting_center_distance_specification",
      displayName: "吊装中心距规格",
      description: "吊装时中心距、规格或图纸确认说明。",
      valueKind: "text",
      applicableProductTypes: ["common"],
    });
    await createTerm("392", {
      termType: "spinneret_specification",
      displayName: "喷丝板规格及孔径",
      description: "喷丝板规格、孔径或图纸确认说明。",
      valueKind: "text",
      applicableProductTypes: ["flat_die"],
    });
    await createTerm("210", {
      termType: "drawing_note",
      displayName: "图纸说明",
      description: "与确认图纸、回签图纸相关的说明。",
      valueKind: "text",
      applicableProductTypes: ["common"],
    });
    await createTerm("193", {
      termType: "deckle_note",
      displayName: "堵边详细说明",
      description: "堵边、挡块、挂钩外挡等详细说明。",
      valueKind: "text",
      applicableProductTypes: ["flat_die"],
    });
    await createTerm("204", {
      termType: "large_distribution_mandrel_count",
      displayName: "大分流芯棒数量",
      description: "分配器大分流芯棒数量。",
      valueKind: "number_or_boolean",
      applicableProductTypes: ["feedblock"],
    });
    await createTerm("304", {
      termType: "hole_diameter",
      displayName: "孔径",
      description: "孔径尺寸。",
      valueKind: "number_unit",
      applicableProductTypes: ["common"],
    });
    await createTerm("307", {
      termType: "hole_spacing",
      displayName: "孔间距",
      description: "孔与孔之间的间距。",
      valueKind: "number_unit",
      applicableProductTypes: ["common"],
    });
    await approveTerm("170", "flat_extrusion_mounting_method");
    await approveTerm("395", "lower_lip_gap", { appendApplicableProductType: true });
    await createTerm("184", {
      termType: "lip_gap_first_set",
      displayName: "开口尺寸（第一套）",
      description: "第一套模唇开口尺寸。",
      valueKind: "number_unit",
      applicableProductTypes: ["flat_die"],
    });
    await createTerm("185", {
      termType: "lip_gap_second_set",
      displayName: "开口尺寸（第二套）",
      description: "第二套模唇开口尺寸。",
      valueKind: "number_unit",
      applicableProductTypes: ["flat_die"],
    });
    await splitTerm("274", [
      {
        termType: "extruder_model",
        displayName: "挤出机型号",
        valueKind: "text",
        rawValue: "Φ 单螺杆挤出机",
        aliasNames: ["挤出机型号"],
        applicableProductTypes: ["metering_pump"],
      },
      {
        termType: "capacity",
        displayName: "产量",
        valueKind: "number_unit",
        rawValue: "kg/h以下",
        aliasNames: ["产量"],
        applicableProductTypes: ["common"],
      },
    ]);
    await createTerm("205", {
      termType: "marking_requirement_note",
      displayName: "标志要求/备注",
      description: "打标、标志及相关备注要求。",
      valueKind: "text",
      applicableProductTypes: ["common"],
    });
    await createTerm("243", {
      termType: "grid_count",
      displayName: "格子数量",
      description: "格子、孔格或网格数量。",
      valueKind: "number",
      applicableProductTypes: ["flat_die"],
    });
    await createTerm("244", {
      termType: "grid_spacing",
      displayName: "格子距离",
      description: "格子、孔格或网格间距。",
      valueKind: "number_unit",
      applicableProductTypes: ["flat_die"],
    });
    await approveTerm("223", "oil_temperature_hole_requirement");
    await createTerm("180", {
      termType: "lip_thickness_adjustment_note",
      displayName: "模唇厚度调节范围备注",
      description: "模唇厚度调节范围相关备注。",
      valueKind: "text",
      applicableProductTypes: ["flat_die"],
    });
    await createTerm("116", {
      termType: "lip_adjustment_method_description",
      displayName: "模唇调节方式说明",
      description: "上下模唇调节方式、结构说明。",
      valueKind: "text",
      applicableProductTypes: ["flat_die"],
    });
    await createTerm("305", {
      termType: "flow_channel_description",
      displayName: "流道形式详细说明",
      description: "流道形式、专用流道及相关说明。",
      valueKind: "text",
      applicableProductTypes: ["flat_die"],
    });
    await createTerm("190", {
      termType: "upper_mold_thermocouple_hole_config",
      displayName: "热电偶孔_上模",
      description: "上模热电偶孔配置。",
      valueKind: "boolean",
      applicableProductTypes: ["flat_die"],
    });
    await createTerm("191", {
      termType: "lower_mold_thermocouple_hole_config",
      displayName: "热电偶孔_下模",
      description: "下模热电偶孔配置。",
      valueKind: "boolean",
      applicableProductTypes: ["flat_die"],
    });
    await createTerm("159", {
      termType: "thermocouple_purchase_note",
      displayName: "热电偶采购说明",
      description: "热电偶采购方、线长等说明。",
      valueKind: "text",
      applicableProductTypes: ["common"],
    });
    await createTerm("214", {
      termType: "power_cable_length_type",
      displayName: "电源联线长度类型",
      description: "电源联线长度为常规或特殊等类型。",
      valueKind: "enum",
      applicableProductTypes: ["common"],
      valueCanonicalValue: "special",
      valueDisplayName: "特殊",
      valueAliasNames: ["特殊"],
    });
    await createTerm("206", {
      termType: "structure_config",
      displayName: "结构配置",
      description: "结构配置或组成说明。",
      valueKind: "text",
      applicableProductTypes: ["common"],
    });
    await createTerm("335", {
      termType: "purchased_part_name",
      displayName: "购买件名称",
      description: "外购件、购买件名称。",
      valueKind: "text",
      applicableProductTypes: ["common"],
    });
    await createTerm("192", {
      termType: "feed_inlet_position",
      displayName: "进料口位置",
      description: "进料口所在位置。",
      valueKind: "text",
      applicableProductTypes: ["common"],
    });
    await approveTerm("149", "feed_inlet_size");
    await approveTerm("200", "feed_inlet_method");
    await createTerm("266", {
      termType: "connector_type",
      displayName: "连接器类型",
      description: "连接器、法兰等连接类型。",
      valueKind: "enum",
      applicableProductTypes: ["common"],
      valueCanonicalValue: "round_flange",
      valueDisplayName: "圆法兰",
      valueAliasNames: ["圆法兰"],
    });
    await createTerm("202", {
      termType: "part_numbers",
      displayName: "配件编号",
      description: "配件或零件编号列表。",
      valueKind: "text",
      applicableProductTypes: ["common"],
    });
    await approveTerm("250", "extruder_model");
    await approveTerm("264", "extruder_model");

    await approveValue("187", await termId("product_type", "sizing_die"), ["二级定型模"]);
    await approveValue("139", await termId("product_type", "flat_die"), ["手动模头"]);
    await approveValue("72", await termId("product_type", "flat_die"), ["板材模头"]);
    await approveValue("74", await termId("product_type", "flat_die"), ["片材模头"]);
    await approveValue("333", await termId("product_type", "flat_die"), ["自动模头"]);
    await approveValue("335", await termId("application", "hollow_board"), ["中空"]);
    await createValue("259", {
      canonicalValue: "conductive_antistatic",
      displayName: "导电/防静电",
      aliasNames: ["导电/防静电", "导电", "防静电"],
    });
    await rejectValue("359", "raw value is the field label 应用领域, not an application enum value");
    await createValue("385", {
      canonicalValue: "HMWHDPE",
      displayName: "HMWHDPE",
      aliasNames: ["HMWHDPE"],
    });
    await approveValue("190", await termId("plastic_material", "PP"), ["(25%）PP", "25%PP"]);
    await approveValue("217", await termId("plastic_material", "EVA"), ["5%左右的EVA"]);
    await approveValue("382", await termId("application", "石头纸"), ["“应用于石头纸”"]);
    await rejectValue("383", "自动模头 is a product/configuration phrase, not a plastic_material value");
    await approveValue("210", await termId("product_material", "SUS316_Forged"), ["316不锈钢"]);
    await approveValue("133", await termId("product_material", "1.2714_Forged"), ["A"]);
    await approveValue("225", await termId("die_lip_surface_roughness", "Ra0.015-0.02μm"), ["A级（0.15-0.02μm)"]);
    await createValue("300", {
      canonicalValue: "extrusion_direction",
      displayName: "按挤出方向",
      aliasNames: ["按挤出方向（                                                                ）", "按挤出方向"],
    });
    await createValue("341", {
      canonicalValue: "round_inlet",
      displayName: "圆口",
      aliasNames: ["圆口"],
    });
    await rejectValue("356", "raw value is the field label 加热电压, not a heating_voltage enum value");
    await approveValue("302", await termId("heating_voltage", "400"), ["400V/50Hz"]);
    await approveValue("289", await termId("heating_voltage", "220"), ["220V/60Hz"]);
    await createValue("390", {
      canonicalValue: "460",
      displayName: "460V",
      aliasNames: ["460V"],
    });
    await approveValue("391", await termId("heating_voltage", "230"), ["(230V)/(50Hz)"]);
    await createValue("372", {
      canonicalValue: "500",
      displayName: "500V",
      aliasNames: ["500 V / 60 Hz", "500V"],
    });
    await approveValue("378", await termId("heating_voltage", "220"), ["220V，50HZ，单相"]);
    await approveValue("396", await termId("heating_voltage", "380"), ["380 V / 50 Hz / 三相"]);

    await dictionaryService.bumpDictionaryVersion();
    const recheck = await dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate({ limit: 1000 });
    const afterCounts = await PgDataSource.query(`
      SELECT 'term_type' AS type, count(*)::int
      FROM quote_agent.dictionary_term_type_candidates
      WHERE status = 'pending'
      UNION ALL
      SELECT 'value' AS type, count(*)::int
      FROM quote_agent.dictionary_candidates
      WHERE status = 'pending'
    `);
    console.log(JSON.stringify({ results, recheck, afterCounts }, null, 2));
    return;
  }

  const termTypes = await PgDataSource.query(`
    SELECT term_type, display_name, value_kind, applicable_product_types
    FROM quote_agent.dictionary_term_types
    WHERE is_active = true
    ORDER BY sort_order, term_type
  `);

  console.log(JSON.stringify({ counts, productTypes, clusterCount: clusters.length, clusters, suggestions, termTypes }, null, 2));
}

main()
  .finally(async () => {
    if (PgDataSource.isInitialized) {
      await PgDataSource.destroy();
    }
  });
