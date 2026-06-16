-- Add accessory/supporting product_type dictionary values.
-- Safe to run multiple times.

WITH product_type_rows AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "canonical_value": "static_mixer",
      "display_name": "静态混合器",
      "description": "静态混合器产品类型。独立标题、产品编号、数量或配置块出现时作为独立 item；只在主产品备注/配置中出现时作为配置字段。",
      "aliases": ["静态混合器", "螺旋式静态混合器", "混合器", "static mixer", "JTHHQ"]
    },
    {
      "canonical_value": "spinneret_plate",
      "display_name": "喷丝板 / 喷丝组件",
      "description": "喷丝板、喷丝组件、喷丝板组件产品类型。独立标题、产品编号、数量或配置块出现时作为独立 item；只在熔喷/纺粘模头配置中出现时作为配置字段。",
      "aliases": ["喷丝板", "喷丝板组件", "喷丝组件", "喷丝板 组件", "spinneret", "spinneret plate", "spinneret assembly"]
    },
    {
      "canonical_value": "monomer_extraction",
      "display_name": "单体抽吸",
      "description": "单体抽吸产品类型，通常为纺粘/熔喷系统配套抽吸装置。独立标题、产品编号、数量或配置块出现时作为独立 item。",
      "aliases": ["单体抽吸", "单体抽吸装置", "单体抽吸系统", "monomer extraction", "monomer suction"]
    },
    {
      "canonical_value": "ibc_cooling_unit",
      "display_name": "IBC 气泡冷却单元",
      "description": "IBC 气泡冷却单元产品类型，通常为吹膜模头配套单元。独立机械部分、控制系统、数量或配置块出现时作为独立 item。",
      "aliases": ["IBC气泡冷却单元", "IBC 气泡冷却单元", "IBC冷却单元", "气泡冷却单元", "IBC", "IBC cooling unit", "internal bubble cooling"]
    },
    {
      "canonical_value": "valve",
      "display_name": "阀",
      "description": "开车阀、换向阀等阀类产品类型。独立型号、标题、数量或配置块出现时作为独立 item；只在液压站/换网器配置中出现时作为配置字段。",
      "aliases": ["阀", "开车阀", "换向阀", "排气阀", "valve", "start-up valve", "switching valve"]
    },
    {
      "canonical_value": "hot_air_pipe",
      "display_name": "热风管道",
      "description": "热风管道、热风管道结合件产品类型。独立标题、产品编号、数量或配置块出现时作为独立 item。",
      "aliases": ["热风管道", "热风管道结合件", "热风管", "hot air pipe", "hot air duct"]
    },
    {
      "canonical_value": "insulation_cover",
      "display_name": "保温罩",
      "description": "保温罩、保温罩结合件产品类型。独立标题、产品编号、数量或配置块出现时作为独立 item。",
      "aliases": ["保温罩", "保温罩结合件", "保温罩组件", "insulation cover", "thermal insulation cover"]
    },
    {
      "canonical_value": "temperature_control_system",
      "display_name": "控温系统",
      "description": "控温系统产品类型。独立标题、数量或配置块出现时作为独立 item；只作为模头/吹膜系统配置出现时作为配置字段。",
      "aliases": ["控温系统", "温控系统", "温度控制系统", "temperature control system", "temperature controller"]
    }
  ]
  $$::jsonb) AS input(
    canonical_value text,
    display_name text,
    description text,
    aliases jsonb
  )
),
upsert_product_types AS (
  INSERT INTO quote_agent.dictionary_terms(
    term_type,
    canonical_value,
    display_name,
    description,
    is_active
  )
  SELECT
    'product_type',
    canonical_value,
    display_name,
    description,
    true
  FROM product_type_rows
  ON CONFLICT(term_type, canonical_value)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now()
  RETURNING id, canonical_value
),
product_type_alias_raw_rows AS (
  SELECT
    terms.id AS term_id,
    'product_type' AS term_type,
    alias_value,
    lower(regexp_replace(trim(alias_value), '\s+', '', 'g')) AS normalized_alias
  FROM product_type_rows
  JOIN quote_agent.dictionary_terms terms
    ON terms.term_type = 'product_type'
   AND terms.canonical_value = product_type_rows.canonical_value
  CROSS JOIN LATERAL jsonb_array_elements_text(product_type_rows.aliases) AS alias_value
),
product_type_alias_rows AS (
  SELECT DISTINCT ON (term_type, normalized_alias)
    term_id,
    term_type,
    alias_value,
    normalized_alias
  FROM product_type_alias_raw_rows
  WHERE normalized_alias <> ''
  ORDER BY term_type, normalized_alias, length(alias_value), alias_value
)
INSERT INTO quote_agent.dictionary_aliases(
  term_id,
  term_type,
  alias_value,
  normalized_alias,
  confidence,
  source,
  usage_count,
  last_seen_at,
  risk_level,
  note,
  is_active
)
SELECT
  term_id,
  term_type,
  alias_value,
  normalized_alias,
  1.0,
  'migration_add_accessory_product_types',
  0,
  null,
  'normal',
  null,
  true
FROM product_type_alias_rows
ON CONFLICT(term_type, normalized_alias)
DO UPDATE SET
  term_id = EXCLUDED.term_id,
  alias_value = EXCLUDED.alias_value,
  source = EXCLUDED.source,
  risk_level = 'normal',
  is_active = true,
  updated_at = now()
WHERE quote_agent.dictionary_aliases.term_id = EXCLUDED.term_id
   OR quote_agent.dictionary_aliases.is_active = false;
