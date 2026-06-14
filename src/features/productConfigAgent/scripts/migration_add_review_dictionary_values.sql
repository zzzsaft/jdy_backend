-- Review queue for dictionary enum values that were present in the historical
-- quote-form summary but were not added to the safer baseline migration.
--
-- Please review by term_type before running. Model values for metering pumps
-- and filters are intentionally excluded because those should come from CRM
-- product master data.
--
-- Open question before adding values:
-- - The old form has "挤出类型/复合类型" values such as 单层挤出、模内共挤、
--   分配器共挤、分配器+模内共挤, but there is not yet a clearly confirmed
--   term type for them in the current dictionary. Suggested key: extrusion_type.

WITH input_rows AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "term_type": "product_material",
      "canonical_value": "XPM光学级",
      "display_name": "XPM光学级",
      "aliases": ["XPM光学级", "XPM"]
    },
    {
      "term_type": "product_material",
      "canonical_value": "SUS304_Forged",
      "display_name": "SUS304锻件",
      "aliases": ["SUS304锻件", "SUS304"]
    },
    {
      "term_type": "product_material",
      "canonical_value": "SUS316_Forged",
      "display_name": "SUS316锻件",
      "aliases": ["SUS316锻件", "SUS316"]
    },
    {
      "term_type": "product_material",
      "canonical_value": "SUS316L_Forged",
      "display_name": "SUS316L锻件",
      "aliases": ["SUS316L锻件", "SUS316L"]
    },
    {
      "term_type": "product_material",
      "canonical_value": "3Cr13_Forged",
      "display_name": "3Cr13锻件",
      "aliases": ["3Cr13锻件", "3Cr13"]
    },

    {
      "term_type": "heating_voltage",
      "canonical_value": "220",
      "display_name": "220V",
      "aliases": ["220", "220V", "220v"]
    },
    {
      "term_type": "heating_voltage",
      "canonical_value": "380",
      "display_name": "380V",
      "aliases": ["380", "380V", "380v"]
    },
    {
      "term_type": "heating_frequency",
      "canonical_value": "50",
      "display_name": "50Hz",
      "aliases": ["50", "50Hz", "50hz"]
    },
    {
      "term_type": "heating_frequency",
      "canonical_value": "60",
      "display_name": "60Hz",
      "aliases": ["60", "60Hz", "60hz"]
    },
    {
      "term_type": "heating_phase",
      "canonical_value": "三相",
      "display_name": "三相",
      "aliases": ["三相"]
    },

    {
      "term_type": "deckle_type",
      "canonical_value": "not_adjustable",
      "display_name": "不可调节",
      "aliases": ["不可调节"]
    },
    {
      "term_type": "deckle_type",
      "canonical_value": "external_deckle_by_engineering_design",
      "display_name": "外挡（技术设计）",
      "aliases": ["外挡（技术设计）", "外挡(技术设计)", "技术设计外挡"]
    },
    {
      "term_type": "deckle_type",
      "canonical_value": "stainless_steel_gasket",
      "display_name": "不锈钢垫片",
      "aliases": ["不锈钢垫片"]
    },
    {
      "term_type": "deckle_type",
      "canonical_value": "none",
      "display_name": "无",
      "aliases": ["无", "没有"]
    },
    {
      "term_type": "upper_lip_adjustment_method",
      "canonical_value": "upper_lip_integral_structure",
      "display_name": "上模整体结构",
      "aliases": ["上模整体结构"]
    },
    {
      "term_type": "upper_choker_bar_angle",
      "canonical_value": "no_choker_bar",
      "display_name": "无阻流棒",
      "aliases": ["无阻流棒", "无"]
    },
    {
      "term_type": "upper_choker_bar_angle",
      "canonical_value": "45°阻流棒",
      "display_name": "45°阻流棒",
      "aliases": ["45°阻流棒", "45°", "45度阻流棒", "45度"]
    },
    {
      "term_type": "upper_choker_bar_angle",
      "canonical_value": "70°阻流棒",
      "display_name": "70°阻流棒",
      "aliases": ["70°阻流棒", "70°", "70度阻流棒", "70度"]
    },
    {
      "term_type": "upper_choker_bar_angle",
      "canonical_value": "90°阻流棒",
      "display_name": "90°阻流棒",
      "aliases": ["90°阻流棒", "90°", "90度阻流棒", "90度"]
    },
    {
      "term_type": "lower_choker_bar_angle",
      "canonical_value": "no_choker_bar",
      "display_name": "无阻流棒",
      "aliases": ["无阻流棒", "无"]
    },
    {
      "term_type": "lower_choker_bar_angle",
      "canonical_value": "90°阻流棒",
      "display_name": "90°阻流棒",
      "aliases": ["90°阻流棒", "90°", "90度阻流棒", "90度"]
    },
    {
      "term_type": "material_source",
      "canonical_value": "supplier_provides_rheology_curves",
      "display_name": "乙方提供各原料样品流变曲线",
      "aliases": ["乙方提供各原料样品流变曲线"]
    },
    {
      "term_type": "material_source",
      "canonical_value": "buyer_provides_samples_for_testing",
      "display_name": "甲方提供各原料样品500g供乙方检测",
      "aliases": ["甲方提供各原料样品500g供乙方检测"]
    },
    {
      "term_type": "material_source",
      "canonical_value": "NA",
      "display_name": "NA",
      "aliases": ["NA", "N/A"]
    },
    {
      "term_type": "flow_channel_type",
      "canonical_value": "单腔流道/衣架式",
      "display_name": "单腔流道/衣架式",
      "aliases": ["单腔流道/衣架式", "衣架式流道"]
    },
    {
      "term_type": "flow_channel_type",
      "canonical_value": "single_cavity_branch_pipe",
      "display_name": "单腔流道/特殊支管式",
      "aliases": ["单腔流道/特殊支管式", "特殊支管式流道"]
    },
    {
      "term_type": "flow_channel_type",
      "canonical_value": "single_cavity_pvb_specific",
      "display_name": "单腔流道/PVB专用流道",
      "aliases": ["单腔流道/PVB专用流道", "PVB专用流道"]
    },
    {
      "term_type": "flow_channel_type",
      "canonical_value": "single_cavity_tpu_specific",
      "display_name": "单腔流道/TPU专用流道",
      "aliases": ["单腔流道/TPU专用流道", "TPU专用流道"]
    },
    {
      "term_type": "flow_channel_type",
      "canonical_value": "single_cavity_eva_specific",
      "display_name": "单腔流道/EVA专用流道",
      "aliases": ["单腔流道/EVA专用流道", "EVA专用流道"]
    },
    {
      "term_type": "flow_channel_type",
      "canonical_value": "single_cavity_hollow_specific",
      "display_name": "单腔流道/中空专用流道",
      "aliases": ["单腔流道/中空专用流道", "中空专用流道"]
    },
    {
      "term_type": "flow_channel_type",
      "canonical_value": "multi_cavity_manifold",
      "display_name": "多腔流道",
      "aliases": ["多腔流道"]
    },
    {
      "term_type": "feed_inlet_size",
      "canonical_value": "supplier_design",
      "display_name": "供方设计",
      "aliases": ["供方设计"]
    },
    {
      "term_type": "feed_inlet_size",
      "canonical_value": "buyer_provides_size",
      "display_name": "需方提供尺寸",
      "aliases": ["需方提供尺寸"]
    },
    {
      "term_type": "body_connector",
      "canonical_value": "square",
      "display_name": "方形",
      "aliases": ["方形"]
    },
    {
      "term_type": "body_connector",
      "canonical_value": "special",
      "display_name": "特殊",
      "aliases": ["特殊"]
    },
    {
      "term_type": "side_plate_connector",
      "canonical_value": "plug",
      "display_name": "插头",
      "aliases": ["插头"]
    },
    {
      "term_type": "side_plate_connector",
      "canonical_value": "metal_flexible_wire",
      "display_name": "金属软线",
      "aliases": ["金属软线"]
    },
    {
      "term_type": "side_plate_connector",
      "canonical_value": "none",
      "display_name": "无",
      "aliases": ["无"]
    },
    {
      "term_type": "die_lip_surface_roughness",
      "canonical_value": "0.015~0.025",
      "display_name": "0.015~0.025",
      "aliases": ["0.015~0.025"]
    },
    {
      "term_type": "die_lip_surface_roughness",
      "canonical_value": "0.02~0.03",
      "display_name": "0.02~0.03",
      "aliases": ["0.02~0.03"]
    },
    {
      "term_type": "die_lip_surface_roughness",
      "canonical_value": "0.04~0.05",
      "display_name": "0.04~0.05",
      "aliases": ["0.04~0.05"]
    },
    {
      "term_type": "channel_plating_thickness",
      "canonical_value": "0.02~0.03",
      "display_name": "0.02~0.03",
      "aliases": ["0.02~0.03"]
    },
    {
      "term_type": "channel_plating_thickness",
      "canonical_value": "0.025~0.05",
      "display_name": "0.025~0.05",
      "aliases": ["0.025~0.05"]
    },
    {
      "term_type": "channel_plating_thickness",
      "canonical_value": "0.04~0.05",
      "display_name": "0.04~0.05",
      "aliases": ["0.04~0.05"]
    },
    {
      "term_type": "external_plating_thickness",
      "canonical_value": "0.01~0.02",
      "display_name": "0.01~0.02",
      "aliases": ["0.01~0.02"]
    },
    {
      "term_type": "external_plating_thickness",
      "canonical_value": "0.02~0.03",
      "display_name": "0.02~0.03",
      "aliases": ["0.02~0.03"]
    },
    {
      "term_type": "external_plating_thickness",
      "canonical_value": "0.03~0.04",
      "display_name": "0.03~0.04",
      "aliases": ["0.03~0.04"]
    },
    {
      "term_type": "channel_plating_hardness",
      "canonical_value": "60-65RockwellC",
      "display_name": "60-65RockwellC",
      "aliases": ["60-65RockwellC", "60-65Rockwellc", "Rockwellc60-65"]
    },
    {
      "term_type": "thermocouple_hole",
      "canonical_value": "yes",
      "display_name": "有",
      "aliases": ["有", "是"]
    },
    {
      "term_type": "thermocouple_hole",
      "canonical_value": "no",
      "display_name": "无",
      "aliases": ["无", "否"]
    },
    {
      "term_type": "thermocouple_hole",
      "canonical_value": "custom",
      "display_name": "自定义",
      "aliases": ["自定义"]
    },

    {
      "term_type": "feedblock_structure",
      "canonical_value": "insert_block",
      "display_name": "镶块式",
      "aliases": ["镶块式"]
    },
    {
      "term_type": "feedblock_structure",
      "canonical_value": "pendulum_blade",
      "display_name": "摆叶式",
      "aliases": ["摆叶式"]
    },
    {
      "term_type": "feedblock_structure",
      "canonical_value": "core_rod",
      "display_name": "芯棒式",
      "aliases": ["芯棒式"]
    },
    {
      "term_type": "feedblock_structure",
      "canonical_value": "jctimes_design",
      "display_name": "精诚设计",
      "aliases": ["精诚设计"]
    },
    {
      "term_type": "feedblock_structure",
      "canonical_value": "custom",
      "display_name": "特殊定制",
      "aliases": ["特殊定制"]
    },
    {
      "term_type": "layer_count",
      "canonical_value": "2",
      "display_name": "两层",
      "aliases": ["两层", "2层"]
    },
    {
      "term_type": "layer_count",
      "canonical_value": "3",
      "display_name": "三层",
      "aliases": ["三层", "3层"]
    },
    {
      "term_type": "layer_count",
      "canonical_value": "4",
      "display_name": "四层",
      "aliases": ["四层", "4层"]
    },
    {
      "term_type": "layer_count",
      "canonical_value": "5",
      "display_name": "五层",
      "aliases": ["五层", "5层"]
    },
    {
      "term_type": "layer_count",
      "canonical_value": "7",
      "display_name": "七层",
      "aliases": ["七层", "7层"]
    },
    {
      "term_type": "layer_count",
      "canonical_value": "9",
      "display_name": "九层",
      "aliases": ["九层", "9层"]
    },
    {
      "term_type": "extruder_count",
      "canonical_value": "2",
      "display_name": "两台机",
      "aliases": ["两台机", "2台机"]
    },
    {
      "term_type": "extruder_count",
      "canonical_value": "3",
      "display_name": "三台机",
      "aliases": ["三台机", "3台机"]
    },
    {
      "term_type": "extruder_count",
      "canonical_value": "4",
      "display_name": "四台机",
      "aliases": ["四台机", "4台机"]
    },
    {
      "term_type": "extruder_count",
      "canonical_value": "5",
      "display_name": "五台机",
      "aliases": ["五台机", "5台机"]
    },
    {
      "term_type": "extruder_count",
      "canonical_value": "6",
      "display_name": "六台机",
      "aliases": ["六台机", "6台机"]
    },
    {
      "term_type": "extruder_count",
      "canonical_value": "7",
      "display_name": "七台机",
      "aliases": ["七台机", "7台机"]
    },
    {
      "term_type": "extruder_count",
      "canonical_value": "8",
      "display_name": "八台机",
      "aliases": ["八台机", "8台机"]
    },
    {
      "term_type": "extruder_count",
      "canonical_value": "9",
      "display_name": "九台机",
      "aliases": ["九台机", "9台机"]
    },
    {
      "term_type": "extruder_orientation",
      "canonical_value": "confirm_by_supplier_drawing",
      "display_name": "按供方提供图纸确认回传为准",
      "aliases": ["按供方提供图纸确认回传为准"]
    },
    {
      "term_type": "wiring_method",
      "canonical_value": "专用接线盒封闭接线",
      "display_name": "专用接线盒封闭接线",
      "aliases": ["专用接线盒封闭接线"]
    },

    {
      "term_type": "metering_pump_type",
      "canonical_value": "standard_metering_pump",
      "display_name": "普通计量泵",
      "aliases": ["普通计量泵"]
    },
    {
      "term_type": "metering_pump_type",
      "canonical_value": "internal_cooling_metering_pump",
      "display_name": "内冷式计量泵",
      "aliases": ["内冷式计量泵"]
    },
    {
      "term_type": "shear_sensitivity",
      "canonical_value": "low",
      "display_name": "低剪切敏感度",
      "aliases": ["低剪切敏感度"]
    },
    {
      "term_type": "shear_sensitivity",
      "canonical_value": "medium",
      "display_name": "中剪切敏感度",
      "aliases": ["中剪切敏感度"]
    },
    {
      "term_type": "shear_sensitivity",
      "canonical_value": "high",
      "display_name": "高剪切敏感度",
      "aliases": ["高剪切敏感度"]
    },
    {
      "term_type": "customization_type",
      "canonical_value": "standard",
      "display_name": "常规",
      "aliases": ["常规"]
    },
    {
      "term_type": "customization_type",
      "canonical_value": "custom",
      "display_name": "定制",
      "aliases": ["定制"]
    },
    {
      "term_type": "metering_pump_options",
      "canonical_value": "pump_body",
      "display_name": "泵体",
      "aliases": ["泵体"]
    },
    {
      "term_type": "metering_pump_options",
      "canonical_value": "transmission_system",
      "display_name": "传动系统",
      "aliases": ["传动系统"]
    },
    {
      "term_type": "metering_pump_options",
      "canonical_value": "control_system",
      "display_name": "控制系统",
      "aliases": ["控制系统"]
    },
    {
      "term_type": "pump_bracket_config",
      "canonical_value": "jctimes_standard",
      "display_name": "精诚标准",
      "aliases": ["精诚标准"]
    },
    {
      "term_type": "pre_pump_sensor_source",
      "canonical_value": "domestic",
      "display_name": "国产",
      "aliases": ["国产"]
    },
    {
      "term_type": "pre_pump_sensor_source",
      "canonical_value": "imported",
      "display_name": "进口",
      "aliases": ["进口"]
    },
    {
      "term_type": "post_pump_sensor_source",
      "canonical_value": "domestic",
      "display_name": "国产",
      "aliases": ["国产"]
    },
    {
      "term_type": "post_pump_sensor_source",
      "canonical_value": "imported",
      "display_name": "进口",
      "aliases": ["进口"]
    },
    {
      "term_type": "transmission_system_brand",
      "canonical_value": "rexnord_changzhou",
      "display_name": "常州莱克斯诺公司",
      "aliases": ["常州莱克斯诺公司", "莱克斯诺"]
    },
    {
      "term_type": "transmission_system_brand",
      "canonical_value": "jienuo",
      "display_name": "捷诺",
      "aliases": ["捷诺"]
    },
    {
      "term_type": "vfd_brand",
      "canonical_value": "fuji_japan",
      "display_name": "日本富士",
      "aliases": ["日本富士", "富士"]
    },
    {
      "term_type": "vfd_brand",
      "canonical_value": "yaskawa",
      "display_name": "安川",
      "aliases": ["安川"]
    },

    {
      "term_type": "pre_mesh_sensor_source",
      "canonical_value": "domestic",
      "display_name": "国产",
      "aliases": ["国产"]
    },
    {
      "term_type": "pre_mesh_sensor_source",
      "canonical_value": "imported",
      "display_name": "进口",
      "aliases": ["进口"]
    },
    {
      "term_type": "post_mesh_sensor_source",
      "canonical_value": "domestic",
      "display_name": "国产",
      "aliases": ["国产"]
    },
    {
      "term_type": "post_mesh_sensor_source",
      "canonical_value": "imported",
      "display_name": "进口",
      "aliases": ["进口"]
    },
    {
      "term_type": "safety_guard_config",
      "canonical_value": "jctimes_standard",
      "display_name": "精诚标准",
      "aliases": ["精诚标准"]
    },

    {
      "term_type": "thickness_gauge_operation_mode",
      "canonical_value": "manual",
      "display_name": "手动",
      "aliases": ["手动"]
    },
    {
      "term_type": "thickness_gauge_operation_mode",
      "canonical_value": "automatic",
      "display_name": "自动",
      "aliases": ["自动"]
    },
    {
      "term_type": "applicable_width",
      "canonical_value": "500",
      "display_name": "500",
      "aliases": ["500"]
    },
    {
      "term_type": "applicable_width",
      "canonical_value": "1000",
      "display_name": "1000",
      "aliases": ["1000"]
    },
    {
      "term_type": "applicable_width",
      "canonical_value": "1500",
      "display_name": "1500",
      "aliases": ["1500"]
    },
    {
      "term_type": "applicable_width",
      "canonical_value": "2000",
      "display_name": "2000",
      "aliases": ["2000"]
    },
    {
      "term_type": "applicable_width",
      "canonical_value": "2500",
      "display_name": "2500",
      "aliases": ["2500"]
    },
    {
      "term_type": "applicable_width",
      "canonical_value": "3000",
      "display_name": "3000",
      "aliases": ["3000"]
    },
    {
      "term_type": "applicable_width",
      "canonical_value": "3500",
      "display_name": "3500",
      "aliases": ["3500"]
    },
    {
      "term_type": "torque_type",
      "canonical_value": "small_torque",
      "display_name": "小扭矩",
      "aliases": ["小扭矩"]
    },
    {
      "term_type": "torque_type",
      "canonical_value": "large_torque",
      "display_name": "大扭矩",
      "aliases": ["大扭矩"]
    },
    {
      "term_type": "operator_head_type",
      "canonical_value": "single_head",
      "display_name": "单机头",
      "aliases": ["单机头"]
    },
    {
      "term_type": "operator_head_type",
      "canonical_value": "dual_head",
      "display_name": "双机头",
      "aliases": ["双机头"]
    },
    {
      "term_type": "vision_config",
      "canonical_value": "with_vision",
      "display_name": "含视觉",
      "aliases": ["含视觉"]
    },
    {
      "term_type": "vision_config",
      "canonical_value": "without_vision",
      "display_name": "不含视觉",
      "aliases": ["不含视觉"]
    },

    {
      "term_type": "micro_adjustment_method",
      "canonical_value": "shim_adjustment",
      "display_name": "垫片调节",
      "aliases": ["垫片调节"]
    },
    {
      "term_type": "micro_adjustment_method",
      "canonical_value": "differential_adjustment",
      "display_name": "差动调节",
      "aliases": ["差动调节"]
    },
    {
      "term_type": "install_direction",
      "canonical_value": "horizontal",
      "display_name": "水平",
      "aliases": ["水平"]
    },
    {
      "term_type": "install_direction",
      "canonical_value": "vertical",
      "display_name": "垂直",
      "aliases": ["垂直"]
    },
    {
      "term_type": "liquid_properties",
      "canonical_value": "corrosive",
      "display_name": "腐蚀性",
      "aliases": ["腐蚀性"]
    },
    {
      "term_type": "liquid_properties",
      "canonical_value": "abrasive",
      "display_name": "磨蚀性",
      "aliases": ["磨蚀性"]
    },
    {
      "term_type": "liquid_properties",
      "canonical_value": "toxic",
      "display_name": "毒性",
      "aliases": ["毒性"]
    },
    {
      "term_type": "liquid_properties",
      "canonical_value": "viscous",
      "display_name": "粘性",
      "aliases": ["粘性"]
    },
    {
      "term_type": "liquid_properties",
      "canonical_value": "easy_crystallization",
      "display_name": "易结晶",
      "aliases": ["易结晶"]
    },
    {
      "term_type": "liquid_properties",
      "canonical_value": "easy_sedimentation",
      "display_name": "易沉淀",
      "aliases": ["易沉淀"]
    },
    {
      "term_type": "liquid_features",
      "canonical_value": "water_like",
      "display_name": "水状",
      "aliases": ["水状"]
    },
    {
      "term_type": "liquid_features",
      "canonical_value": "honey_like",
      "display_name": "蜂蜜状",
      "aliases": ["蜂蜜状"]
    },
    {
      "term_type": "liquid_features",
      "canonical_value": "latex_like",
      "display_name": "乳胶状",
      "aliases": ["乳胶状"]
    },
    {
      "term_type": "liquid_features",
      "canonical_value": "slurry_like",
      "display_name": "砂浆状",
      "aliases": ["砂浆状"]
    },
    {
      "term_type": "liquid_features",
      "canonical_value": "clay_slurry_like",
      "display_name": "粘土浆状",
      "aliases": ["粘土浆状"]
    },
    {
      "term_type": "fluid_type",
      "canonical_value": "newtonian_fluid",
      "display_name": "牛顿流体",
      "aliases": ["牛顿流体"]
    },
    {
      "term_type": "fluid_type",
      "canonical_value": "non_newtonian_fluid",
      "display_name": "非牛顿流体",
      "aliases": ["非牛顿流体"]
    },
    {
      "term_type": "throughput_unit",
      "canonical_value": "kg/h",
      "display_name": "kg/h",
      "aliases": ["kg/h"]
    },
    {
      "term_type": "throughput_unit",
      "canonical_value": "ml/min",
      "display_name": "ml/min",
      "aliases": ["ml/min"]
    },
    {
      "term_type": "substrate",
      "canonical_value": "glass",
      "display_name": "玻璃",
      "aliases": ["玻璃"]
    },
    {
      "term_type": "polishing_required",
      "canonical_value": "required",
      "display_name": "需要",
      "aliases": ["需要"]
    },
    {
      "term_type": "polishing_required",
      "canonical_value": "not_required",
      "display_name": "不需要",
      "aliases": ["不需要", "无需"]
    },
    {
      "term_type": "screw_type",
      "canonical_value": "stainless_steel_screw",
      "display_name": "不锈钢螺丝",
      "aliases": ["不锈钢螺丝"]
    },
    {
      "term_type": "design_source",
      "canonical_value": "supplier_design",
      "display_name": "供方设计",
      "aliases": ["供方设计"]
    },
    {
      "term_type": "design_source",
      "canonical_value": "buyer_provides_size",
      "display_name": "需方提供尺寸",
      "aliases": ["需方提供尺寸"]
    }
  ]
  $$::jsonb) AS input(
    term_type text,
    canonical_value text,
    display_name text,
    aliases jsonb
  )
),
duplicate_value_rows AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "term_type": "product_material",
      "from_canonical_value": "XPM",
      "to_canonical_value": "XPM光学级"
    },
    {
      "term_type": "upper_choker_bar_angle",
      "from_canonical_value": "45°",
      "to_canonical_value": "45°阻流棒"
    },
    {
      "term_type": "upper_choker_bar_angle",
      "from_canonical_value": "70°",
      "to_canonical_value": "70°阻流棒"
    },
    {
      "term_type": "upper_choker_bar_angle",
      "from_canonical_value": "90°",
      "to_canonical_value": "90°阻流棒"
    },
    {
      "term_type": "lower_choker_bar_angle",
      "from_canonical_value": "90°",
      "to_canonical_value": "90°阻流棒"
    },
    {
      "term_type": "flow_channel_type",
      "from_canonical_value": "coat_hanger_manifold",
      "to_canonical_value": "单腔流道/衣架式"
    },
    {
      "term_type": "channel_plating_hardness",
      "from_canonical_value": "Rockwellc60-65",
      "to_canonical_value": "60-65RockwellC"
    },
    {
      "term_type": "wiring_method",
      "from_canonical_value": "dedicated_junction_box_enclosed_wiring",
      "to_canonical_value": "专用接线盒封闭接线"
    }
  ]
  $$::jsonb) AS input(
    term_type text,
    from_canonical_value text,
    to_canonical_value text
  )
),
upsert_terms AS (
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
  FROM input_rows
  ON CONFLICT(term_type, canonical_value)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_active = true,
    updated_at = now()
  RETURNING id, term_type, canonical_value
),
target_duplicate_terms AS (
  SELECT
    duplicate_value_rows.term_type,
    duplicate_value_rows.from_canonical_value,
    duplicate_value_rows.to_canonical_value,
    source.id AS source_term_id,
    COALESCE(upserted_target.id, existing_target.id) AS target_term_id
  FROM duplicate_value_rows
  JOIN quote_agent.dictionary_terms source
    ON source.term_type = duplicate_value_rows.term_type
   AND source.canonical_value = duplicate_value_rows.from_canonical_value
  LEFT JOIN upsert_terms upserted_target
    ON upserted_target.term_type = duplicate_value_rows.term_type
   AND upserted_target.canonical_value = duplicate_value_rows.to_canonical_value
  LEFT JOIN quote_agent.dictionary_terms existing_target
    ON existing_target.term_type = duplicate_value_rows.term_type
   AND existing_target.canonical_value = duplicate_value_rows.to_canonical_value
  WHERE COALESCE(upserted_target.id, existing_target.id) IS NOT NULL
),
copy_duplicate_term_aliases AS (
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
    target_duplicate_terms.target_term_id,
    aliases.term_type,
    aliases.alias_value,
    aliases.normalized_alias,
    aliases.confidence,
    'migration_review_dictionary_values_merge',
    aliases.usage_count,
    aliases.last_seen_at,
    aliases.risk_level,
    aliases.note,
    true
  FROM target_duplicate_terms
  JOIN quote_agent.dictionary_aliases aliases
    ON aliases.term_id = target_duplicate_terms.source_term_id
  ON CONFLICT(term_type, normalized_alias) DO NOTHING
  RETURNING id
),
deactivate_duplicate_terms AS (
  UPDATE quote_agent.dictionary_terms source
  SET
    is_active = false,
    description = COALESCE(
      source.description,
      '已合并到更详细的标准值。'
    ),
    updated_at = now()
  FROM target_duplicate_terms
  WHERE source.id = target_duplicate_terms.source_term_id
    AND source.id <> target_duplicate_terms.target_term_id
  RETURNING source.id
),
deactivate_duplicate_aliases AS (
  UPDATE quote_agent.dictionary_aliases aliases
  SET
    is_active = false,
    updated_at = now()
  FROM target_duplicate_terms
  WHERE aliases.term_id = target_duplicate_terms.source_term_id
    AND target_duplicate_terms.source_term_id <> target_duplicate_terms.target_term_id
  RETURNING aliases.id
),
alias_rows AS (
  SELECT
    terms.id AS term_id,
    input_rows.term_type,
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
  FROM input_rows
  JOIN quote_agent.dictionary_terms terms
    ON terms.term_type = input_rows.term_type
   AND terms.canonical_value = input_rows.canonical_value
  CROSS JOIN LATERAL jsonb_array_elements_text(input_rows.aliases) AS alias_value
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
  'migration_review_dictionary_values',
  0,
  null,
  'normal',
  null,
  true
FROM alias_rows
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
   OR quote_agent.dictionary_aliases.is_active = false;
