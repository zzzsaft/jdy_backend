-- Supplement quoteAgent dictionary term types from the historical quote form
-- field summary. This script adds field definitions, field aliases, and the
-- product_type values needed by those fields. Other enum values are
-- intentionally left for a separate, reviewable migration.

WITH input_rows AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "term_type": "smart_regulator_config",
      "display_name": "智能调节器配置",
      "quote_display_name": "智能调节器配置",
      "description": "是否搭配或选配智能调节器。",
      "category": "accessory",
      "value_kind": "boolean",
      "sort_order": 331,
      "applicable_product_types": ["flat_die"],
      "aliases": ["是否搭配智能调节器", "智能调节器", "智能调节器配置"]
    },
    {
      "term_type": "thickness_gauge_config",
      "display_name": "测厚仪配置",
      "quote_display_name": "测厚仪配置",
      "description": "是否选配测厚仪。",
      "category": "accessory",
      "value_kind": "boolean",
      "sort_order": 332,
      "applicable_product_types": ["flat_die", "smart_regulator"],
      "aliases": ["是否选配测厚仪", "测厚仪", "测厚仪配置"]
    },
    {
      "term_type": "manifold_config",
      "display_name": "合流器配置",
      "quote_display_name": "合流器配置",
      "description": "是否选配合流器。",
      "category": "accessory",
      "value_kind": "boolean",
      "sort_order": 333,
      "applicable_product_types": ["flat_die"],
      "aliases": ["是否选配合流器", "合流器", "合流器配置"]
    },
    {
      "term_type": "material_source",
      "display_name": "原料来源",
      "quote_display_name": "原料来源",
      "description": "原料样品或流变曲线由供方/需方提供的说明。",
      "category": "material",
      "value_kind": "enum",
      "sort_order": 205,
      "applicable_product_types": ["flat_die"],
      "aliases": ["原料来源", "材料来源", "原料提供方式"]
    },
    {
      "term_type": "thermal_insulation_config",
      "display_name": "隔热装置配置",
      "quote_display_name": "隔热装置配置",
      "description": "是否选配隔热装置。",
      "category": "thermal",
      "value_kind": "boolean",
      "sort_order": 421,
      "applicable_product_types": ["flat_die"],
      "aliases": ["是否选配隔热装置", "隔热装置", "隔热装置配置"]
    },
    {
      "term_type": "lip_thickness_adjustment_range",
      "display_name": "模唇厚度调节范围",
      "quote_display_name": "模唇厚度调节范围",
      "description": "模唇厚度调节范围，也用于归一化模唇开口尺寸。",
      "category": "dimension",
      "value_kind": "number_unit",
      "sort_order": 150,
      "applicable_product_types": ["flat_die"],
      "aliases": ["模唇厚度范围", "模唇厚度调节范围", "模唇开口", "模唇开口(mm)", "开口尺寸"]
    },
    {
      "term_type": "center_height",
      "display_name": "中心高度",
      "quote_display_name": "中心高度",
      "description": "小车、挤出机或传动系统中心高度。",
      "category": "dimension",
      "value_kind": "number_unit",
      "sort_order": 152,
      "applicable_product_types": ["common"],
      "aliases": ["小车中心高度", "中心高度", "中心高"]
    },
    {
      "term_type": "thermal_expansion_cable_length",
      "display_name": "热膨胀数据线长度",
      "quote_display_name": "热膨胀数据线长度",
      "description": "热膨胀数据线长度。",
      "category": "electrical",
      "value_kind": "number_unit",
      "sort_order": 515,
      "applicable_product_types": ["flat_die"],
      "aliases": ["热膨胀数据长", "热膨胀数据线长度", "热膨胀线长度"]
    },
    {
      "term_type": "specification_identical_to_original",
      "display_name": "规格型号与原产品相同",
      "quote_display_name": "规格型号与原产品相同",
      "description": "规格型号是否与历史或原产品相同。",
      "category": "history",
      "value_kind": "text",
      "sort_order": 960,
      "applicable_product_types": ["common"],
      "aliases": ["规格型号与原产品相同", "是否购买过相同型号产品", "购买过相同型号", "是否买过相同型号", "同型号产品"]
    },
    {
      "term_type": "reference_product",
      "display_name": "参考产品编号",
      "quote_display_name": "参考产品编号",
      "description": "参考历史产品、原产品、同型号产品或互配产品的编号。",
      "category": "history",
      "value_kind": "text",
      "sort_order": 961,
      "applicable_product_types": ["common"],
      "aliases": ["reference_die", "参考产品编号", "参考模头编号", "同型号产品编号", "原产品编号", "上次产品编号", "历史产品编号", "互配产品编号", "互配产品编码"]
    },
    {
      "term_type": "specification_compatible_with_original",
      "display_name": "规格型号与原产品互配",
      "quote_display_name": "规格型号与原产品互配",
      "description": "规格型号是否与历史或原产品互配。",
      "category": "history",
      "value_kind": "boolean",
      "sort_order": 962,
      "applicable_product_types": ["common"],
      "aliases": ["规格型号与原产品互配", "是否与购买过的产品互配", "是否互配", "产品互配", "连接器互配说明"]
    },
    {
      "term_type": "precision_grade",
      "display_name": "精度等级",
      "quote_display_name": "精度等级",
      "description": "模头精度等级，例如 S、A、B 或定制。",
      "category": "surface",
      "value_kind": "enum",
      "sort_order": 590,
      "applicable_product_types": ["flat_die"],
      "aliases": ["精度等级", "模头精度等级"]
    },
    {
      "term_type": "laser_hardening_config",
      "display_name": "激光硬化配置",
      "quote_display_name": "激光硬化配置",
      "description": "是否激光硬化。",
      "category": "surface",
      "value_kind": "boolean",
      "sort_order": 591,
      "applicable_product_types": ["flat_die"],
      "aliases": ["是否激光硬化", "激光硬化"]
    },
    {
      "term_type": "surface_plating_config",
      "display_name": "电镀配置",
      "quote_display_name": "电镀配置",
      "description": "是否电镀。",
      "category": "surface",
      "value_kind": "boolean",
      "sort_order": 592,
      "applicable_product_types": ["flat_die"],
      "aliases": ["是否电镀", "电镀配置", "电镀"]
    },
    {
      "term_type": "surface_treatment_note",
      "display_name": "表面处理备注",
      "quote_display_name": "表面处理备注",
      "description": "表面处理、电镀或抛光相关备注。",
      "category": "surface",
      "value_kind": "text",
      "sort_order": 640,
      "applicable_product_types": ["common"],
      "aliases": ["表面处理备注", "表面备注"]
    },
    {
      "term_type": "custom_thermocouple_hole",
      "display_name": "自定义热电偶孔",
      "quote_display_name": "自定义热电偶孔",
      "description": "自定义热电偶孔说明。",
      "category": "electrical",
      "value_kind": "text",
      "sort_order": 541,
      "applicable_product_types": ["common"],
      "aliases": ["自定义热电偶孔", "自定义热电偶孔说明"]
    },
    {
      "term_type": "glass_thermocouple_config",
      "display_name": "玻璃测温孔配置",
      "quote_display_name": "玻璃测温孔配置",
      "description": "是否配置玻璃测温孔。",
      "category": "thermal",
      "value_kind": "boolean",
      "sort_order": 422,
      "applicable_product_types": ["flat_die"],
      "aliases": ["玻璃测温孔", "玻璃测温孔配置"]
    },
    {
      "term_type": "side_plate_heating_config",
      "display_name": "侧板加热配置",
      "quote_display_name": "侧板加热配置",
      "description": "是否配置侧板加热。",
      "category": "thermal",
      "value_kind": "boolean",
      "sort_order": 423,
      "applicable_product_types": ["flat_die"],
      "aliases": ["侧板加热", "侧板加热配置"]
    },
    {
      "term_type": "die_lip_heating_config",
      "display_name": "模唇加热配置",
      "quote_display_name": "模唇加热配置",
      "description": "是否配置模唇加热。",
      "category": "thermal",
      "value_kind": "boolean",
      "sort_order": 424,
      "applicable_product_types": ["flat_die"],
      "aliases": ["模唇加热", "模唇加热配置"]
    },

    {
      "term_type": "feedblock_structure",
      "display_name": "分配器结构",
      "quote_display_name": "分配器结构",
      "description": "分配器结构，例如镶块式、摆叶式、芯棒式等。",
      "category": "structure",
      "value_kind": "enum",
      "sort_order": 371,
      "applicable_product_types": ["feedblock"],
      "aliases": ["分配器结构", "结构"]
    },
    {
      "term_type": "extruder_count",
      "display_name": "挤出机数量",
      "quote_display_name": "挤出机数量",
      "description": "配套挤出机数量。",
      "category": "structure",
      "value_kind": "number",
      "sort_order": 373,
      "applicable_product_types": ["feedblock"],
      "aliases": ["挤出机数量", "挤出机数"]
    },
    {
      "term_type": "extruder_orientation",
      "display_name": "挤出机排列方向",
      "quote_display_name": "挤出机排列方向",
      "description": "挤出机排列方向或图纸确认说明。",
      "category": "installation",
      "value_kind": "enum",
      "sort_order": 721,
      "applicable_product_types": ["feedblock"],
      "aliases": ["挤出机排列方向", "挤出机方向"]
    },

    {
      "term_type": "metering_pump_type",
      "display_name": "计量泵类型",
      "quote_display_name": "计量泵类型",
      "description": "计量泵类型，例如普通计量泵、内冷式计量泵。",
      "category": "pump",
      "value_kind": "enum",
      "sort_order": 1010,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["类型", "计量泵类型", "泵类型"]
    },
    {
      "term_type": "shear_sensitivity",
      "display_name": "材料剪切敏感度",
      "quote_display_name": "材料剪切敏感度",
      "description": "物料剪切敏感度。",
      "category": "material",
      "value_kind": "enum",
      "sort_order": 1011,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["材料特性", "剪切敏感度", "材料剪切敏感度"]
    },
    {
      "term_type": "customization_type",
      "display_name": "常规/定制",
      "quote_display_name": "常规/定制",
      "description": "产品为常规或定制。",
      "category": "basic",
      "value_kind": "enum",
      "sort_order": 1012,
      "applicable_product_types": ["metering_pump", "filter"],
      "aliases": ["是否定制", "常规/定制", "定制类型"]
    },
    {
      "term_type": "metering_pump_options",
      "display_name": "计量泵配置",
      "quote_display_name": "计量泵配置",
      "description": "计量泵配置范围，例如泵体、传动系统、控制系统。",
      "category": "pump",
      "value_kind": "enums",
      "sort_order": 1013,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["计量泵配置", "泵配置"]
    },
    {
      "term_type": "pump_bracket_config",
      "display_name": "计量泵支架配置",
      "quote_display_name": "计量泵支架配置",
      "description": "计量泵支架是否配置及规格。",
      "category": "pump",
      "value_kind": "text",
      "sort_order": 1014,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["计量泵支架", "计量泵支架配置", "泵支架"]
    },
    {
      "term_type": "pressure_sensor_hole_config",
      "display_name": "压力传感器孔配置",
      "quote_display_name": "压力传感器孔配置",
      "description": "是否配置压力传感器孔。",
      "category": "sensor",
      "value_kind": "boolean",
      "sort_order": 1015,
      "applicable_product_types": ["metering_pump", "filter"],
      "aliases": ["压力传感器孔", "压力传感器孔配置"]
    },
    {
      "term_type": "pre_pump_sensor_source",
      "display_name": "泵前传感器来源",
      "quote_display_name": "泵前传感器来源",
      "description": "泵前压力传感器为国产或进口。",
      "category": "sensor",
      "value_kind": "enum",
      "sort_order": 1016,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["泵前", "泵前传感器", "泵前传感器来源"]
    },
    {
      "term_type": "post_pump_sensor_source",
      "display_name": "泵后传感器来源",
      "quote_display_name": "泵后传感器来源",
      "description": "泵后压力传感器为国产或进口。",
      "category": "sensor",
      "value_kind": "enum",
      "sort_order": 1017,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["泵后", "泵后传感器", "泵后传感器来源"]
    },
    {
      "term_type": "pump_heating_method",
      "display_name": "泵体加热方式",
      "quote_display_name": "泵体加热方式",
      "description": "计量泵泵体加热方式。",
      "category": "thermal",
      "value_kind": "enums",
      "sort_order": 1018,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["泵体加热方式", "泵加热方式"]
    },
    {
      "term_type": "pump_heating_voltage",
      "display_name": "泵体加热电压",
      "quote_display_name": "泵体加热电压",
      "description": "计量泵泵体加热电压、频率或相。",
      "category": "thermal",
      "value_kind": "text",
      "sort_order": 1019,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["泵体加热电压", "泵加热电压"]
    },
    {
      "term_type": "transmission_system_brand",
      "display_name": "传动系统品牌",
      "quote_display_name": "传动系统品牌",
      "description": "计量泵传动系统品牌。",
      "category": "drive",
      "value_kind": "enum",
      "sort_order": 1020,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["传动系统品牌", "传动品牌"]
    },
    {
      "term_type": "variable_speed_motor",
      "display_name": "调速电机",
      "quote_display_name": "调速电机",
      "description": "变频调速电机配置。",
      "category": "drive",
      "value_kind": "text",
      "sort_order": 1021,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["调速电机", "变频电机"]
    },
    {
      "term_type": "reducer_config",
      "display_name": "减速箱配置",
      "quote_display_name": "减速箱配置",
      "description": "减速箱配置。",
      "category": "drive",
      "value_kind": "text",
      "sort_order": 1022,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["减速箱", "减速箱配置"]
    },
    {
      "term_type": "drive_shaft_config",
      "display_name": "万向传动轴配置",
      "quote_display_name": "万向传动轴配置",
      "description": "万向传动轴配置。",
      "category": "drive",
      "value_kind": "text",
      "sort_order": 1023,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["万向传动轴", "传动轴", "万向传动轴配置"]
    },
    {
      "term_type": "motor_voltage",
      "display_name": "电机电压",
      "quote_display_name": "电机电压",
      "description": "传动系统电机电压、频率或相。",
      "category": "drive",
      "value_kind": "text",
      "sort_order": 1024,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["电机电压", "传动系统电压"]
    },
    {
      "term_type": "pre_pump_control_system",
      "display_name": "泵前控制系统",
      "quote_display_name": "泵前控制系统",
      "description": "泵前控制系统配置。",
      "category": "control",
      "value_kind": "enum",
      "sort_order": 1025,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["泵前控制系统"]
    },
    {
      "term_type": "pre_pump_control_system_brand",
      "display_name": "泵前控制系统品牌",
      "quote_display_name": "泵前控制系统品牌",
      "description": "泵前控制系统品牌。",
      "category": "control",
      "value_kind": "enum",
      "sort_order": 1026,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["泵前控制系统品牌"]
    },
    {
      "term_type": "post_pump_control_system",
      "display_name": "泵后控制系统",
      "quote_display_name": "泵后控制系统",
      "description": "泵后控制系统配置。",
      "category": "control",
      "value_kind": "enum",
      "sort_order": 1027,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["泵后控制系统"]
    },
    {
      "term_type": "vfd_power",
      "display_name": "变频调速器功率",
      "quote_display_name": "变频调速器功率",
      "description": "变频调速器功率。",
      "category": "drive",
      "value_kind": "number_unit",
      "sort_order": 1028,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["变频调速器功率", "变频器功率"]
    },
    {
      "term_type": "vfd_brand",
      "display_name": "变频调速器品牌",
      "quote_display_name": "变频调速器品牌",
      "description": "变频调速器品牌。",
      "category": "drive",
      "value_kind": "enum",
      "sort_order": 1029,
      "applicable_product_types": ["metering_pump"],
      "aliases": ["变频调速器品牌", "变频器品牌"]
    },

    {
      "term_type": "filter_plate",
      "display_name": "过滤板",
      "quote_display_name": "过滤板",
      "description": "过滤器过滤板配置。",
      "category": "filter",
      "value_kind": "text",
      "sort_order": 1100,
      "applicable_product_types": ["filter"],
      "aliases": ["过滤板"]
    },
    {
      "term_type": "filter_model",
      "display_name": "过滤器型号",
      "quote_display_name": "过滤器型号",
      "description": "过滤器型号；具体型号和过滤板、产量、尺寸、重量、过滤面积等明细应从 crm_product_filter 产品主数据匹配，不在 dictionary_terms 中手工维护。",
      "category": "filter",
      "value_kind": "text",
      "sort_order": 1000,
      "applicable_product_types": ["filter"],
      "aliases": ["型号", "过滤器型号", "换网器型号"]
    },
    {
      "term_type": "dimension",
      "display_name": "尺寸",
      "quote_display_name": "尺寸",
      "description": "产品外形或安装尺寸。",
      "category": "dimension",
      "value_kind": "text",
      "sort_order": 1101,
      "applicable_product_types": ["filter"],
      "aliases": ["尺寸", "外形尺寸"]
    },
    {
      "term_type": "weight",
      "display_name": "重量",
      "quote_display_name": "重量",
      "description": "产品重量。",
      "category": "dimension",
      "value_kind": "number_unit",
      "sort_order": 1102,
      "applicable_product_types": ["filter"],
      "aliases": ["重量"]
    },
    {
      "term_type": "filter_diameter",
      "display_name": "滤网直径",
      "quote_display_name": "滤网直径",
      "description": "过滤器滤网直径。",
      "category": "filter",
      "value_kind": "number_unit",
      "sort_order": 1103,
      "applicable_product_types": ["filter"],
      "aliases": ["滤网直径"]
    },
    {
      "term_type": "effective_filter_area",
      "display_name": "有效过滤面积",
      "quote_display_name": "有效过滤面积",
      "description": "过滤器有效过滤面积。",
      "category": "filter",
      "value_kind": "number_unit",
      "sort_order": 1104,
      "applicable_product_types": ["filter"],
      "aliases": ["有效过滤面积", "过滤面积"]
    },
    {
      "term_type": "pressure",
      "display_name": "压力",
      "quote_display_name": "压力",
      "description": "压力或压力等级。",
      "category": "technical",
      "value_kind": "number_unit",
      "sort_order": 1105,
      "applicable_product_types": ["filter", "metering_pump", "hydraulic_station"],
      "aliases": ["压力", "压力等级"]
    },
    {
      "term_type": "filter_holder_config",
      "display_name": "过滤器支架配置",
      "quote_display_name": "过滤器支架配置",
      "description": "是否选配过滤器支架。",
      "category": "filter",
      "value_kind": "boolean",
      "sort_order": 1106,
      "applicable_product_types": ["filter"],
      "aliases": ["是否选配过滤器支架", "过滤器支架", "过滤器支架配置"]
    },
    {
      "term_type": "safety_guard_config",
      "display_name": "安全护罩配置",
      "quote_display_name": "安全护罩配置",
      "description": "过滤器安全护罩配置。",
      "category": "safety",
      "value_kind": "text",
      "sort_order": 1107,
      "applicable_product_types": ["filter"],
      "aliases": ["过滤器安全护罩", "安全护罩", "安全护罩配置"]
    },
    {
      "term_type": "hydraulic_station_config",
      "display_name": "液压站配置",
      "quote_display_name": "液压站配置",
      "description": "是否配置液压站。",
      "category": "hydraulic",
      "value_kind": "boolean",
      "sort_order": 1108,
      "applicable_product_types": ["filter"],
      "aliases": ["是否配置液压站", "液压站", "液压站配置"]
    },
    {
      "term_type": "pre_mesh_sensor_source",
      "display_name": "网前传感器来源",
      "quote_display_name": "网前传感器来源",
      "description": "网前压力传感器为国产或进口。",
      "category": "sensor",
      "value_kind": "enum",
      "sort_order": 1109,
      "applicable_product_types": ["filter"],
      "aliases": ["网前", "网前传感器", "网前传感器来源"]
    },
    {
      "term_type": "post_mesh_sensor_source",
      "display_name": "网后传感器来源",
      "quote_display_name": "网后传感器来源",
      "description": "网后压力传感器为国产或进口。",
      "category": "sensor",
      "value_kind": "enum",
      "sort_order": 1110,
      "applicable_product_types": ["filter"],
      "aliases": ["网后", "网后传感器", "网后传感器来源"]
    },
    {
      "term_type": "mesh_belt_spec",
      "display_name": "网带规格",
      "quote_display_name": "网带规格",
      "description": "网带规格。",
      "category": "filter",
      "value_kind": "text",
      "sort_order": 1111,
      "applicable_product_types": ["filter"],
      "aliases": ["网带规格"]
    },
    {
      "term_type": "control_system_count",
      "display_name": "控制系统数量",
      "quote_display_name": "控制系统数量",
      "description": "控制系统数量。",
      "category": "control",
      "value_kind": "number",
      "sort_order": 1112,
      "applicable_product_types": ["filter"],
      "aliases": ["控制系统数量", "控制系统数"]
    },
    {
      "term_type": "control_system_config",
      "display_name": "控制系统配置",
      "quote_display_name": "控制系统配置",
      "description": "控制系统配置或说明。",
      "category": "control",
      "value_kind": "text",
      "sort_order": 1113,
      "applicable_product_types": ["filter", "metering_pump"],
      "aliases": ["控制系统", "控制系统配置"]
    },

    {
      "term_type": "thickness_gauge_operation_mode",
      "display_name": "测厚仪控制方式",
      "quote_display_name": "测厚仪控制方式",
      "description": "测厚仪控制方式，例如手动或自动。",
      "category": "thickness_gauge",
      "value_kind": "enum",
      "sort_order": 1200,
      "applicable_product_types": ["thickness_gauge"],
      "aliases": ["控制方式", "测厚仪控制方式"]
    },
    {
      "term_type": "applicable_width",
      "display_name": "适用宽度",
      "quote_display_name": "适用宽度",
      "description": "设备适用宽度，通常带 mm 单位。",
      "category": "dimension",
      "value_kind": "number_unit",
      "sort_order": 1201,
      "applicable_product_types": ["thickness_gauge"],
      "aliases": ["适用宽度", "适用宽度(mm)"]
    },
    {
      "term_type": "robot_control_box_config",
      "display_name": "机械臂控制盒配置",
      "quote_display_name": "机械臂控制盒配置",
      "description": "是否选配机械臂控制盒。",
      "category": "thickness_gauge",
      "value_kind": "boolean",
      "sort_order": 1202,
      "applicable_product_types": ["thickness_gauge"],
      "aliases": ["选配机械臂控制盒", "机械臂控制盒"]
    },
    {
      "term_type": "bolt_control_box_config",
      "display_name": "全马达螺栓控制盒配置",
      "quote_display_name": "全马达螺栓控制盒配置",
      "description": "是否选配全马达螺栓控制盒。",
      "category": "thickness_gauge",
      "value_kind": "boolean",
      "sort_order": 1203,
      "applicable_product_types": ["thickness_gauge"],
      "aliases": ["选配全马达螺栓控制盒", "全马达螺栓控制盒"]
    },

    {
      "term_type": "bundled_with_new_product",
      "display_name": "是否配套新产品",
      "quote_display_name": "是否配套新产品",
      "description": "智能调节器是否配套新产品。",
      "category": "smart_regulator",
      "value_kind": "boolean",
      "sort_order": 1300,
      "applicable_product_types": ["smart_regulator"],
      "aliases": ["是否配套新产品", "配套新产品"]
    },
    {
      "term_type": "torque_type",
      "display_name": "扭矩类型",
      "quote_display_name": "扭矩类型",
      "description": "智能调节器扭矩类型。",
      "category": "smart_regulator",
      "value_kind": "enum",
      "sort_order": 1301,
      "applicable_product_types": ["smart_regulator"],
      "aliases": ["扭矩", "扭矩类型"]
    },
    {
      "term_type": "operator_head_type",
      "display_name": "机头类型",
      "quote_display_name": "机头类型",
      "description": "智能调节器机头类型，例如单机头、双机头。",
      "category": "smart_regulator",
      "value_kind": "enum",
      "sort_order": 1302,
      "applicable_product_types": ["smart_regulator"],
      "aliases": ["机头", "机头类型"]
    },
    {
      "term_type": "vision_config",
      "display_name": "视觉配置",
      "quote_display_name": "视觉配置",
      "description": "是否包含视觉系统。历史前端字段曾拼写为 vison。",
      "category": "smart_regulator",
      "value_kind": "enum",
      "sort_order": 1303,
      "applicable_product_types": ["smart_regulator"],
      "aliases": ["视觉", "视觉配置", "vison", "vision"]
    },

    {
      "term_type": "included_spare_parts",
      "display_name": "随机备品备件",
      "quote_display_name": "随机备品备件",
      "description": "随产品赠送或附带的备品备件说明，例如加热管、螺丝等。",
      "category": "accessory",
      "value_kind": "text",
      "sort_order": 1400,
      "applicable_product_types": ["common"],
      "aliases": ["随机备品备件", "随机备品", "随机备件", "赠送备件", "赠品明细", "随单赠品", "附带备件"]
    },

    {
      "term_type": "coating_process",
      "display_name": "涂布工艺",
      "quote_display_name": "涂布工艺",
      "description": "涂布模头工艺。",
      "category": "coating_die",
      "value_kind": "enum",
      "sort_order": 1500,
      "applicable_product_types": ["coating_die"],
      "aliases": ["工艺", "涂布工艺"]
    },
    {
      "term_type": "micro_adjustment_method",
      "display_name": "微调方式",
      "quote_display_name": "微调方式",
      "description": "涂布模头调节方式，例如垫片调节、差动调节。",
      "category": "coating_die",
      "value_kind": "enum",
      "sort_order": 1501,
      "applicable_product_types": ["coating_die"],
      "aliases": ["调节方式", "微调方式"]
    },
    {
      "term_type": "install_direction",
      "display_name": "安装方向",
      "quote_display_name": "安装方向",
      "description": "安装方向，例如水平、垂直。",
      "category": "installation",
      "value_kind": "enum",
      "sort_order": 1502,
      "applicable_product_types": ["coating_die"],
      "aliases": ["安装方向"]
    },
    {
      "term_type": "liquid_properties",
      "display_name": "液体属性",
      "quote_display_name": "液体属性",
      "description": "涂布液体属性，例如腐蚀性、磨蚀性、毒性等。",
      "category": "coating_die",
      "value_kind": "enums",
      "sort_order": 1503,
      "applicable_product_types": ["coating_die"],
      "aliases": ["液体属性"]
    },
    {
      "term_type": "liquid_features",
      "display_name": "液体特征",
      "quote_display_name": "液体特征",
      "description": "涂布液体特征，例如水状、蜂蜜状、乳胶状等。",
      "category": "coating_die",
      "value_kind": "enums",
      "sort_order": 1504,
      "applicable_product_types": ["coating_die"],
      "aliases": ["液体特征"]
    },
    {
      "term_type": "fluid_type",
      "display_name": "流体类型",
      "quote_display_name": "流体类型",
      "description": "流体类型，例如牛顿流体、非牛顿流体。",
      "category": "coating_die",
      "value_kind": "enum",
      "sort_order": 1505,
      "applicable_product_types": ["coating_die"],
      "aliases": ["流体类型"]
    },
    {
      "term_type": "throughput_unit",
      "display_name": "产量单位",
      "quote_display_name": "产量单位",
      "description": "产量单位，例如 kg/h、ml/min。",
      "category": "technical",
      "value_kind": "enum",
      "sort_order": 1506,
      "applicable_product_types": ["coating_die"],
      "aliases": ["产量单位"]
    },
    {
      "term_type": "substrate",
      "display_name": "基材",
      "quote_display_name": "基材",
      "description": "涂布基材。",
      "category": "coating_die",
      "value_kind": "enum",
      "sort_order": 1507,
      "applicable_product_types": ["coating_die"],
      "aliases": ["基材"]
    },
    {
      "term_type": "polishing_required",
      "display_name": "是否抛光/处理",
      "quote_display_name": "是否抛光/处理",
      "description": "涂布模头是否需要抛光或处理。",
      "category": "surface",
      "value_kind": "enum",
      "sort_order": 1508,
      "applicable_product_types": ["coating_die"],
      "aliases": ["是否抛光/处理", "是否抛光", "是否处理"]
    },
    {
      "term_type": "screw_type",
      "display_name": "螺丝类型",
      "quote_display_name": "螺丝类型",
      "description": "螺丝类型或规格。",
      "category": "accessory",
      "value_kind": "enum",
      "sort_order": 1509,
      "applicable_product_types": ["coating_die"],
      "aliases": ["螺丝", "螺丝类型"]
    },
    {
      "term_type": "design_source",
      "display_name": "设计来源",
      "quote_display_name": "设计来源",
      "description": "设计来源，例如供方设计、需方提供尺寸。",
      "category": "drawing",
      "value_kind": "enum",
      "sort_order": 1510,
      "applicable_product_types": ["coating_die"],
      "aliases": ["设计来源"]
    }
  ]
  $$::jsonb) AS input(
    term_type text,
    display_name text,
    quote_display_name text,
    description text,
    category text,
    value_kind text,
    sort_order int,
    applicable_product_types jsonb,
    aliases jsonb
  )
),
upsert_term_types AS (
  INSERT INTO quote_agent.dictionary_term_types(
    term_type,
    display_name,
    quote_display_name,
    description,
    category,
    value_kind,
    sort_order,
    applicable_product_types,
    is_active
  )
  SELECT
    term_type,
    display_name,
    quote_display_name,
    description,
    category,
    value_kind,
    sort_order,
    applicable_product_types,
    true
  FROM input_rows
  ON CONFLICT(term_type)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    quote_display_name = EXCLUDED.quote_display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    value_kind = EXCLUDED.value_kind,
    sort_order = EXCLUDED.sort_order,
    applicable_product_types = (
      SELECT jsonb_agg(DISTINCT item)
      FROM jsonb_array_elements_text(
        COALESCE(quote_agent.dictionary_term_types.applicable_product_types, '[]'::jsonb)
        || EXCLUDED.applicable_product_types
      ) AS item
    ),
    is_active = true,
    updated_at = now()
  RETURNING term_type
),
product_type_rows AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "canonical_value": "smart_regulator",
      "display_name": "智能调节器",
      "description": "智能调节器字段，例如扭矩、机头、视觉、测厚仪配置。",
      "aliases": ["智能调节器", "智能调节系统", "自动调节器"]
    },
    {
      "canonical_value": "thickness_gauge",
      "display_name": "测厚仪",
      "description": "测厚仪字段，例如型号、控制方式、适用宽度、控制盒配置。",
      "aliases": ["测厚仪", "在线测厚仪", "厚度测量仪"]
    },
    {
      "canonical_value": "manifold",
      "display_name": "合流器",
      "description": "合流器字段，例如材质、连接方式、加热方式、流道配置。",
      "aliases": ["合流器", "合流块", "manifold"]
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
product_type_alias_rows AS (
  SELECT
    terms.id AS term_id,
    'product_type' AS term_type,
    alias_value,
    lower(
      regexp_replace(
        translate(
          regexp_replace(trim(alias_value), '[■□☑✔✓]', '', 'g'),
          '×（）()[]【】_-：:;；,，、"“”',
          'x'
        ),
        '\s+',
        '',
        'g'
      )
    ) AS normalized_alias
  FROM product_type_rows
  JOIN quote_agent.dictionary_terms terms
    ON terms.term_type = 'product_type'
   AND terms.canonical_value = product_type_rows.canonical_value
  CROSS JOIN LATERAL jsonb_array_elements_text(product_type_rows.aliases) AS alias_value
),
upsert_product_type_aliases AS (
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
    'migration_missing_dictionary_term_types',
    0,
    null,
    'normal',
    null,
    true
  FROM product_type_alias_rows
  WHERE normalized_alias <> ''
  ON CONFLICT(term_type, normalized_alias)
  DO UPDATE SET
    term_id = EXCLUDED.term_id,
    alias_value = EXCLUDED.alias_value,
    source = EXCLUDED.source,
    risk_level = 'normal',
    is_active = true,
    updated_at = now()
  WHERE quote_agent.dictionary_aliases.term_id = EXCLUDED.term_id
     OR quote_agent.dictionary_aliases.is_active = false
  RETURNING id
),
enum_value_rows AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "term_type": "plastic_material",
      "canonical_value": "PEEK",
      "display_name": "PEEK",
      "aliases": ["PEEK"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "PMMA",
      "display_name": "PMMA",
      "aliases": ["PMMA"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "PES-P",
      "display_name": "PES-P",
      "aliases": ["PES-P", "PESP"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "PES-T",
      "display_name": "PES-T",
      "aliases": ["PES-T", "PEST"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "PVB",
      "display_name": "PVB",
      "aliases": ["PVB"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "ABS",
      "display_name": "ABS",
      "aliases": ["ABS"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "HIPS",
      "display_name": "HIPS",
      "aliases": ["HIPS"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "GPPS",
      "display_name": "GPPS",
      "aliases": ["GPPS"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "PETG",
      "display_name": "PETG",
      "aliases": ["PETG"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "PLA",
      "display_name": "PLA",
      "aliases": ["PLA"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "HDPE",
      "display_name": "HDPE",
      "aliases": ["HDPE"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "POE",
      "display_name": "POE",
      "aliases": ["POE"]
    },
    {
      "term_type": "plastic_material",
      "canonical_value": "TPE",
      "display_name": "TPE",
      "aliases": ["TPE"]
    },

    {
      "term_type": "heating_method",
      "canonical_value": "oil_heating",
      "display_name": "油加温",
      "aliases": ["油加温", "油加热"]
    },
    {
      "term_type": "heating_method",
      "canonical_value": "heating_band",
      "display_name": "加热圈",
      "aliases": ["加热圈"]
    },
    {
      "term_type": "heating_method",
      "canonical_value": "cast_aluminum_heating_plate",
      "display_name": "铸铝加热板",
      "aliases": ["铸铝加热板"]
    },
    {
      "term_type": "heating_method",
      "canonical_value": "cast_copper_heating_plate",
      "display_name": "铸铜加热板",
      "aliases": ["铸铜加热板"]
    },

    {
      "term_type": "die_mounting_method",
      "canonical_value": "forty_five_degree_adjustment_up",
      "display_name": "45° 挤出微调朝上",
      "aliases": ["45° 挤出微调朝上", "45°挤出微调朝上"]
    },
    {
      "term_type": "die_mounting_method",
      "canonical_value": "forty_five_degree_adjustment_down",
      "display_name": "45° 挤出微调朝下",
      "aliases": ["45° 挤出微调朝下", "45°挤出微调朝下"]
    },
    {
      "term_type": "die_mounting_method",
      "canonical_value": "thirty_degree_three_roll_mounting",
      "display_name": "30° 斜三辊安装",
      "aliases": ["30° 斜三辊安装", "30°斜三辊安装"]
    },

    {
      "term_type": "feed_inlet_method",
      "canonical_value": "other_feed_shape_or_position",
      "display_name": "其他形状或不同位置进料",
      "aliases": ["其他形状或不同位置进料", "其他形状进料", "不同位置进料"]
    },

    {
      "term_type": "wiring_method",
      "canonical_value": "jctimes_standard_wiring",
      "display_name": "按精诚标准接线",
      "aliases": ["按精诚标准接线", "精诚标准接线"]
    },
    {
      "term_type": "wiring_method",
      "canonical_value": "die_body_slotted_wiring",
      "display_name": "模体开槽接线",
      "aliases": ["模体开槽接线"]
    },
    {
      "term_type": "wiring_method",
      "canonical_value": "other",
      "display_name": "其他",
      "aliases": ["其他", "其它"]
    },

    {
      "term_type": "surface_plating_type",
      "canonical_value": "nickel_phosphorus_plating",
      "display_name": "镀镍磷合金",
      "aliases": ["镀镍磷合金", "镍磷合金"]
    },
    {
      "term_type": "surface_plating_type",
      "canonical_value": "other",
      "display_name": "其他",
      "aliases": ["其他", "其它"]
    }
  ]
  $$::jsonb) AS input(
    term_type text,
    canonical_value text,
    display_name text,
    aliases jsonb
  )
),
upsert_enum_values AS (
  INSERT INTO quote_agent.dictionary_terms(
    term_type,
    canonical_value,
    display_name,
    description,
    is_active
  )
  SELECT
    term_type,
    canonical_value,
    display_name,
    null,
    true
  FROM enum_value_rows
  ON CONFLICT(term_type, canonical_value)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_active = true,
    updated_at = now()
  RETURNING id
),
enum_value_alias_rows AS (
  SELECT
    terms.id AS term_id,
    enum_value_rows.term_type,
    alias_value,
    lower(
      regexp_replace(
        translate(
          regexp_replace(trim(alias_value), '[■□☑✔✓]', '', 'g'),
          '×（）()[]【】_-：:;；,，、"“”',
          'x'
        ),
        '\s+',
        '',
        'g'
      )
    ) AS normalized_alias
  FROM enum_value_rows
  JOIN quote_agent.dictionary_terms terms
    ON terms.term_type = enum_value_rows.term_type
   AND terms.canonical_value = enum_value_rows.canonical_value
  CROSS JOIN LATERAL jsonb_array_elements_text(enum_value_rows.aliases) AS alias_value
),
upsert_enum_value_aliases AS (
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
    'migration_missing_dictionary_term_types',
    0,
    null,
    'normal',
    null,
    true
  FROM enum_value_alias_rows
  WHERE normalized_alias <> ''
  ON CONFLICT(term_type, normalized_alias)
  DO UPDATE SET
    term_id = EXCLUDED.term_id,
    alias_value = EXCLUDED.alias_value,
    source = EXCLUDED.source,
    risk_level = 'normal',
    is_active = true,
    updated_at = now()
  WHERE quote_agent.dictionary_aliases.term_id = EXCLUDED.term_id
     OR quote_agent.dictionary_aliases.is_active = false
  RETURNING id
),
alias_rows AS (
  SELECT
    input_rows.term_type,
    alias_name,
    lower(
      regexp_replace(
        translate(
          regexp_replace(trim(alias_name), '[■□☑✔✓]', '', 'g'),
          '×（）()[]【】_-：:;；,，、"“”',
          'x'
        ),
        '\s+',
        '',
        'g'
      )
    ) AS normalized_alias_name
  FROM input_rows
  CROSS JOIN LATERAL jsonb_array_elements_text(input_rows.aliases) AS alias_name
)
INSERT INTO quote_agent.dictionary_term_type_aliases(
  term_type,
  alias_name,
  normalized_alias_name,
  description,
  source,
  usage_count,
  last_seen_at,
  is_active
)
SELECT
  term_type,
  alias_name,
  normalized_alias_name,
  null,
  'migration_missing_dictionary_term_types',
  0,
  null,
  true
FROM alias_rows
WHERE normalized_alias_name <> ''
ON CONFLICT(normalized_alias_name)
DO UPDATE SET
  alias_name = EXCLUDED.alias_name,
  source = EXCLUDED.source,
  is_active = true,
  updated_at = now()
WHERE quote_agent.dictionary_term_type_aliases.term_type = EXCLUDED.term_type
   OR quote_agent.dictionary_term_type_aliases.is_active = false;
