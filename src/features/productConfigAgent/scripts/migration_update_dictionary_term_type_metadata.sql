-- Clean up early quoteAgent dictionary term type metadata.
-- Many rows were created with the default sort_order = 100 and empty
-- descriptions. This migration gives those rows stable business ordering and
-- clearer descriptions for review UI and LLM dictionary context.

WITH input_rows AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "term_type": "product_name",
      "display_name": "产品名称",
      "quote_display_name": "产品名称",
      "description": "报价产品名称或规格名称。",
      "category": "basic",
      "value_kind": "text",
      "sort_order": 11,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "item_quantity",
      "display_name": "数量",
      "quote_display_name": "数量",
      "description": "产品、分配器、换网器、连接器等报价项目数量。",
      "category": "basic",
      "value_kind": "number",
      "sort_order": 12,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "product_effective_width",
      "display_name": "制品有效宽度",
      "quote_display_name": "制品有效宽度",
      "description": "制品有效宽度，通常带 mm 单位。",
      "category": "dimension",
      "value_kind": "number_unit",
      "sort_order": 101,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "product_effective_thickness",
      "display_name": "制品有效厚度",
      "quote_display_name": "制品有效厚度",
      "description": "制品有效厚度，通常带 mm 单位。",
      "category": "dimension",
      "value_kind": "number_unit",
      "sort_order": 102,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "capacity",
      "display_name": "产量",
      "quote_display_name": "产量",
      "description": "产品适用产量或生产能力，通常带 kg/h、l/h 等单位。",
      "category": "technical",
      "value_kind": "number_unit",
      "sort_order": 120,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "pump_displacement",
      "display_name": "排量",
      "quote_display_name": "排量",
      "description": "计量泵排量，通常带 cm3/rev 单位。",
      "category": "pump",
      "value_kind": "number_unit",
      "sort_order": 121,
      "applicable_product_types": ["metering_pump"]
    },
    {
      "term_type": "rotation_speed",
      "display_name": "转速",
      "quote_display_name": "转速",
      "description": "计量泵或驱动系统转速，通常带 rpm 单位。",
      "category": "pump",
      "value_kind": "number_unit",
      "sort_order": 122,
      "applicable_product_types": ["metering_pump"]
    },
    {
      "term_type": "die_effective_width",
      "display_name": "模头有效宽度",
      "quote_display_name": "模头有效宽度",
      "description": "模头或口模有效宽度，通常带 mm 单位。",
      "category": "dimension",
      "value_kind": "number_unit",
      "sort_order": 130,
      "applicable_product_types": ["flat_die"]
    },
    {
      "term_type": "die_width",
      "display_name": "模头总宽度",
      "quote_display_name": "模头总宽度",
      "description": "模头整体宽度，通常带 mm 单位。",
      "category": "dimension",
      "value_kind": "number_unit",
      "sort_order": 131,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "lip_thickness_adjustment_range",
      "display_name": "模唇厚度调节范围",
      "quote_display_name": "模唇厚度调节范围",
      "description": "模唇厚度调节范围，也用于归一化模唇开口尺寸。",
      "category": "dimension",
      "value_kind": "number_unit",
      "sort_order": 150,
      "applicable_product_types": ["flat_die"]
    },
    {
      "term_type": "product_material",
      "display_name": "产品材质",
      "quote_display_name": "产品材质",
      "description": "模体、分配器、连接器等主体材质。",
      "category": "material",
      "value_kind": "enum",
      "sort_order": 200,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "die_lip_surface_roughness",
      "display_name": "模唇表面粗糙度",
      "quote_display_name": "模唇表面粗糙度",
      "description": "模唇流面或表面的抛光粗糙度要求。",
      "category": "surface",
      "value_kind": "enum",
      "sort_order": 580,
      "applicable_product_types": ["flat_die"]
    },
    {
      "term_type": "other_surface_roughness",
      "display_name": "其他表面粗糙度",
      "quote_display_name": "其他表面粗糙度",
      "description": "非模唇流面或其他表面的抛光粗糙度要求。",
      "category": "surface",
      "value_kind": "enum",
      "sort_order": 581,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "heating_frequency",
      "display_name": "加热频率",
      "quote_display_name": "加热频率",
      "description": "加热电源频率，通常为 50Hz 或 60Hz。",
      "category": "thermal",
      "value_kind": "number_unit",
      "sort_order": 431,
      "applicable_product_types": ["flat_die", "feedblock", "filter", "metering_pump"]
    },
    {
      "term_type": "heating_phase",
      "display_name": "相",
      "quote_display_name": "相",
      "description": "加热电源相数，例如单相、三相。",
      "category": "thermal",
      "value_kind": "enum",
      "sort_order": 432,
      "applicable_product_types": ["flat_die", "feedblock", "metering_pump"]
    },
    {
      "term_type": "heating_power",
      "display_name": "加热功率",
      "quote_display_name": "加热功率",
      "description": "加热功率，通常带 kW 单位。",
      "category": "thermal",
      "value_kind": "number_unit",
      "sort_order": 433,
      "applicable_product_types": ["flat_die", "feedblock"]
    },
    {
      "term_type": "die_lip_heating_zone",
      "display_name": "模唇加热分区",
      "quote_display_name": "模唇加热分区",
      "description": "模唇加热分区数量。",
      "category": "thermal",
      "value_kind": "number",
      "sort_order": 425,
      "applicable_product_types": ["flat_die"]
    },
    {
      "term_type": "side_plates_heating_zone",
      "display_name": "侧板加热分区",
      "quote_display_name": "侧板加热分区",
      "description": "侧板加热配置或分区数量。",
      "category": "thermal",
      "value_kind": "number_or_boolean",
      "sort_order": 426,
      "applicable_product_types": ["flat_die"]
    },
    {
      "term_type": "glass_measuring_hole_zone_count",
      "display_name": "玻璃测温孔",
      "quote_display_name": "玻璃测温孔",
      "description": "玻璃测温孔配置或分区数量。",
      "category": "thermal",
      "value_kind": "number",
      "sort_order": 427,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "die_temperature_controller",
      "display_name": "模温控制器配置",
      "quote_display_name": "模温控制器配置",
      "description": "是否配置模温控制器。",
      "category": "accessory",
      "value_kind": "boolean",
      "sort_order": 428,
      "applicable_product_types": ["flat_die"]
    },
    {
      "term_type": "thermocouple_hole_specification",
      "display_name": "热电偶孔规格",
      "quote_display_name": "热电偶孔规格",
      "description": "热电偶孔径、安装尺寸、接口规格或连接规格要求。",
      "category": "electrical",
      "value_kind": "text",
      "sort_order": 542,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "metering_pump_model",
      "display_name": "计量泵型号",
      "quote_display_name": "计量泵型号",
      "description": "计量泵型号；具体型号和排量、转速、功率等明细应从 crm_products_pump 产品主数据匹配，不在 dictionary_terms 中手工维护。",
      "category": "pump",
      "value_kind": "text",
      "sort_order": 1000,
      "applicable_product_types": ["metering_pump"]
    },
    {
      "term_type": "die_fixed_trolley",
      "display_name": "模头固定小车",
      "quote_display_name": "模头固定小车",
      "description": "是否配置模头固定小车。",
      "category": "accessory",
      "value_kind": "boolean",
      "sort_order": 910,
      "applicable_product_types": ["flat_die"]
    },
    {
      "term_type": "specification_identical_to_original",
      "display_name": "规格型号与原产品相同",
      "quote_display_name": "规格型号与原产品相同",
      "description": "规格型号是否与历史或原产品相同。",
      "category": "history",
      "value_kind": "text",
      "sort_order": 960,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "reference_die",
      "new_term_type": "reference_product",
      "display_name": "参考产品编号",
      "quote_display_name": "参考产品编号",
      "description": "参考历史产品、原产品、同型号产品或互配产品的编号。",
      "category": "history",
      "value_kind": "text",
      "sort_order": 961,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "specification_compatible_with_original",
      "display_name": "规格型号与原产品互配",
      "quote_display_name": "规格型号与原产品互配",
      "description": "规格型号是否与历史或原产品互配。",
      "category": "history",
      "value_kind": "boolean",
      "sort_order": 962,
      "applicable_product_types": ["common"]
    },
    {
      "term_type": "layer_ratio",
      "display_name": "每层复合比例",
      "quote_display_name": "每层复合比例",
      "description": "多层复合结构中每层的比例。",
      "category": "structure",
      "value_kind": "text",
      "sort_order": 371,
      "applicable_product_types": ["feedblock"]
    }
  ]
  $$::jsonb) AS input(
    term_type text,
    new_term_type text,
    display_name text,
    quote_display_name text,
    description text,
    category text,
    value_kind text,
    sort_order int,
    applicable_product_types jsonb
  )
),
rename_reference_product AS (
  UPDATE quote_agent.dictionary_term_types target
  SET
    term_type = 'reference_product',
    display_name = '参考产品编号',
    quote_display_name = '参考产品编号',
    description = '参考历史产品、原产品、同型号产品或互配产品的编号。',
    category = 'history',
    value_kind = 'text',
    sort_order = 961,
    applicable_product_types = '["common"]'::jsonb,
    updated_at = now()
  WHERE target.term_type = 'reference_die'
    AND NOT EXISTS (
      SELECT 1
      FROM quote_agent.dictionary_term_types existing
      WHERE existing.term_type = 'reference_product'
    )
  RETURNING target.term_type
),
move_reference_aliases AS (
  UPDATE quote_agent.dictionary_term_type_aliases
  SET
    term_type = 'reference_product',
    updated_at = now()
  WHERE term_type = 'reference_die'
  RETURNING id
),
deactivate_master_data_model_terms AS (
  UPDATE quote_agent.dictionary_terms target
  SET
    is_active = false,
    description = COALESCE(
      target.description,
      '型号标准值改由 CRM 产品主数据维护，不再由 quoteAgent dictionary_terms 手工维护。'
    ),
    updated_at = now()
  WHERE target.term_type IN ('metering_pump_model', 'filter_model')
    AND target.is_active = true
  RETURNING id
)
UPDATE quote_agent.dictionary_term_types target
SET
  display_name = input.display_name,
  quote_display_name = input.quote_display_name,
  description = input.description,
  category = input.category,
  value_kind = input.value_kind,
  sort_order = input.sort_order,
  applicable_product_types = input.applicable_product_types,
  is_active = true,
  updated_at = now()
FROM input_rows input
WHERE target.term_type = COALESCE(input.new_term_type, input.term_type);
