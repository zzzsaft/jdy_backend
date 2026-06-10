-- Manual conversion of reviewed quoteAgent candidates into dictionary records.
-- Safe to rerun: all inserts use ON CONFLICT.
--
-- This file is intentionally ASCII-only. It reads alias/value text from the
-- candidate tables by id, so no candidate raw Chinese/mojibake text is copied
-- into this SQL file and no file-encoding conversion can corrupt it.
--
-- Pump/filter concrete model values are NOT inserted into dictionary_terms.
-- Those are routed to CRM product master data. Only field-name aliases are
-- inserted for model fields.

BEGIN;

CREATE OR REPLACE FUNCTION quote_agent.tmp_normalize_dictionary_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        replace(lower(trim(coalesce(input, ''))), 'x', 'x'),
        '[[:space:]]+',
        '',
        'g'
      ),
      '[._/\\|,;:()\[\]{}<>\-]',
      '',
      'g'
    ),
    '[[:cntrl:]]+',
    '',
    'g'
  );
$$;

WITH new_term_type_rows AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "term_type": "oil_temperature_hole_requirement",
      "display_name": "Oil temperature hole requirement",
      "quote_display_name": "Oil temperature hole requirement",
      "description": "Oil temperature hole requirement for die body or related parts.",
      "category": "thermal",
      "value_kind": "text",
      "sort_order": 434,
      "applicable_product_types": ["flat_die", "feedblock"]
    },
    {
      "term_type": "extruder_model",
      "display_name": "Extruder model",
      "quote_display_name": "Extruder model",
      "description": "Applicable or paired extruder model.",
      "category": "extruder",
      "value_kind": "text",
      "sort_order": 700,
      "applicable_product_types": ["flat_die", "feedblock", "filter", "metering_pump"]
    },
    {
      "term_type": "process_temperature",
      "display_name": "Process temperature",
      "quote_display_name": "Process temperature",
      "description": "Process temperature range or setting.",
      "category": "thermal",
      "value_kind": "number_unit",
      "sort_order": 435,
      "applicable_product_types": ["filter", "metering_pump", "common"]
    },
    {
      "term_type": "heating_zone_description",
      "display_name": "Heating zone description",
      "quote_display_name": "Heating zone description",
      "description": "Heating zone count or zone description.",
      "category": "thermal",
      "value_kind": "text",
      "sort_order": 436,
      "applicable_product_types": ["filter", "metering_pump", "common"]
    },
    {
      "term_type": "filter_structure_type",
      "display_name": "Filter structure type",
      "quote_display_name": "Filter structure type",
      "description": "Filter or screen changer structure/specification.",
      "category": "filter",
      "value_kind": "text",
      "sort_order": 1099,
      "applicable_product_types": ["filter"]
    },
    {
      "term_type": "filter_station_move_time",
      "display_name": "Filter station move time",
      "quote_display_name": "Filter station move time",
      "description": "Dual station movement or switching time.",
      "category": "filter",
      "value_kind": "number_unit",
      "sort_order": 1114,
      "applicable_product_types": ["filter"]
    },
    {
      "term_type": "hydraulic_valve_type",
      "display_name": "Hydraulic valve type",
      "quote_display_name": "Hydraulic valve type",
      "description": "Hydraulic valve type, such as solenoid valve.",
      "category": "hydraulic",
      "value_kind": "enum",
      "sort_order": 1115,
      "applicable_product_types": ["filter", "hydraulic_station"]
    },
    {
      "term_type": "hydraulic_valve_sharing_mode",
      "display_name": "Hydraulic valve sharing mode",
      "quote_display_name": "Hydraulic valve sharing mode",
      "description": "Hydraulic valve sharing mode.",
      "category": "hydraulic",
      "value_kind": "enum",
      "sort_order": 1116,
      "applicable_product_types": ["filter", "hydraulic_station"]
    },
    {
      "term_type": "motor_frequency",
      "display_name": "Motor frequency",
      "quote_display_name": "Motor frequency",
      "description": "Motor power frequency.",
      "category": "electrical",
      "value_kind": "number_unit",
      "sort_order": 1031,
      "applicable_product_types": ["filter", "metering_pump", "hydraulic_station"]
    },
    {
      "term_type": "normal_production_capacity",
      "display_name": "Normal production capacity",
      "quote_display_name": "Normal production capacity",
      "description": "Normal or applicable production capacity range.",
      "category": "production",
      "value_kind": "number_unit",
      "sort_order": 1117,
      "applicable_product_types": ["filter", "metering_pump", "common"]
    },
    {
      "term_type": "metering_pump_serial_number",
      "display_name": "Metering pump serial number",
      "quote_display_name": "Metering pump serial number",
      "description": "Metering pump body serial number.",
      "category": "pump",
      "value_kind": "text",
      "sort_order": 1032,
      "applicable_product_types": ["metering_pump"]
    }
  ]
  $$) AS row(
    term_type text,
    display_name text,
    quote_display_name text,
    description text,
    category text,
    value_kind text,
    sort_order int,
    applicable_product_types jsonb
  )
),
upsert_new_term_types AS (
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
  FROM new_term_type_rows
  ON CONFLICT(term_type)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    quote_display_name = EXCLUDED.quote_display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    value_kind = EXCLUDED.value_kind,
    sort_order = EXCLUDED.sort_order,
    applicable_product_types = EXCLUDED.applicable_product_types,
    is_active = true,
    updated_at = now()
  RETURNING term_type
),
term_type_candidate_map(candidate_id, target_term_type) AS (
  VALUES
    ('319', 'oil_temperature_hole_requirement'),
    ('320', 'extruder_model'),
    ('321', 'extruder_model'),
    ('226', 'extruder_model'),
    ('228', 'dimension'),
    ('229', 'weight'),
    ('323', 'effective_filter_area'),
    ('265', 'process_temperature'),
    ('234', 'heating_phase'),
    ('235', 'heating_power'),
    ('325', 'heating_zone_description'),
    ('187', 'filter_structure_type'),
    ('155', 'filter_station_move_time'),
    ('156', 'hydraulic_station_config'),
    ('327', 'hydraulic_valve_type'),
    ('328', 'hydraulic_valve_sharing_mode'),
    ('161', 'motor_voltage'),
    ('248', 'motor_frequency'),
    ('326', 'pre_mesh_sensor_source'),
    ('316', 'filter_model'),
    ('274', 'extruder_model'),
    ('249', 'process_temperature'),
    ('329', 'normal_production_capacity'),
    ('173', 'heating_power'),
    ('71', 'product_material'),
    ('331', 'pre_pump_sensor_source'),
    ('332', 'post_pump_sensor_source'),
    ('63', 'metering_pump_serial_number')
),
upsert_term_type_aliases AS (
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
    map.target_term_type,
    candidate.raw_field_name,
    candidate.normalized_field_name,
    concat('manual candidate import from candidate ', candidate.id::text),
    'manual_candidate_sql',
    0,
    null,
    true
  FROM term_type_candidate_map map
  JOIN quote_agent.dictionary_term_type_candidates candidate
    ON candidate.id::text = map.candidate_id
  WHERE candidate.normalized_field_name <> ''
  ON CONFLICT(normalized_alias_name)
  DO UPDATE SET
    term_type = EXCLUDED.term_type,
    alias_name = EXCLUDED.alias_name,
    description = EXCLUDED.description,
    source = EXCLUDED.source,
    is_active = true,
    updated_at = now()
  RETURNING id
),
value_candidate_map(candidate_id, target_term_type, canonical_value, display_name) AS (
  VALUES
    ('175', 'product_material', 'standard', 'Standard'),
    ('164', 'connection_drawing_status', 'customer_provided', 'Customer provided drawing'),
    ('136', 'heating_method', 'oil_heating', 'Oil heating')
),
term_type_candidate_value_map(candidate_id, target_term_type, canonical_value, display_name) AS (
  VALUES
    ('234', 'heating_phase', 'single_phase', 'Single phase'),
    ('327', 'hydraulic_valve_type', 'solenoid_valve', 'Solenoid valve'),
    ('328', 'hydraulic_valve_sharing_mode', 'single_valve_shared', 'Single valve shared')
),
combined_value_map(candidate_id, candidate_source, target_term_type, canonical_value, display_name) AS (
  SELECT candidate_id, 'value'::text, target_term_type, canonical_value, display_name
  FROM value_candidate_map
  UNION ALL
  SELECT candidate_id, 'term_type'::text, target_term_type, canonical_value, display_name
  FROM term_type_candidate_value_map
),
upsert_values AS (
  INSERT INTO quote_agent.dictionary_terms(
    term_type,
    canonical_value,
    display_name,
    description,
    is_active
  )
  SELECT
    target_term_type,
    canonical_value,
    display_name,
    concat('manual candidate import from ', candidate_source, ' candidate ', candidate_id),
    true
  FROM combined_value_map
  ON CONFLICT(term_type, canonical_value)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_active = true,
    updated_at = now()
  RETURNING id, term_type, canonical_value
),
value_alias_source_rows AS (
  SELECT
    term.id,
    map.target_term_type AS term_type,
    candidate.raw_value AS alias_value,
    candidate.normalized_raw_value AS normalized_alias,
    concat('manual candidate import from candidate ', candidate.id::text) AS note
  FROM value_candidate_map map
  JOIN quote_agent.dictionary_candidates candidate
    ON candidate.id::text = map.candidate_id
  JOIN quote_agent.dictionary_terms term
    ON term.term_type = map.target_term_type
   AND term.canonical_value = map.canonical_value
  WHERE candidate.normalized_raw_value <> ''
  UNION ALL
  SELECT
    term.id,
    map.target_term_type AS term_type,
    candidate.raw_value AS alias_value,
    quote_agent.tmp_normalize_dictionary_text(candidate.raw_value) AS normalized_alias,
    concat('manual candidate import from term_type candidate ', candidate.id::text) AS note
  FROM term_type_candidate_value_map map
  JOIN quote_agent.dictionary_term_type_candidates candidate
    ON candidate.id::text = map.candidate_id
  JOIN quote_agent.dictionary_terms term
    ON term.term_type = map.target_term_type
   AND term.canonical_value = map.canonical_value
  WHERE quote_agent.tmp_normalize_dictionary_text(candidate.raw_value) <> ''
),
upsert_value_aliases AS (
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
    id,
    term_type,
    alias_value,
    normalized_alias,
    '1.000',
    'manual_candidate_sql',
    0,
    null,
    'normal',
    note,
    true
  FROM value_alias_source_rows
  ON CONFLICT(term_type, normalized_alias)
  DO UPDATE SET
    term_id = EXCLUDED.term_id,
    alias_value = EXCLUDED.alias_value,
    confidence = EXCLUDED.confidence,
    source = EXCLUDED.source,
    risk_level = EXCLUDED.risk_level,
    note = EXCLUDED.note,
    is_active = true,
    updated_at = now()
  RETURNING id
),
resolved_term_type_candidates AS (
  UPDATE quote_agent.dictionary_term_type_candidates candidate
  SET
    proposed_term_type = map.target_term_type,
    status = 'auto_resolved',
    reviewed_by = 'manual_sql',
    reviewed_at = now(),
    reason = concat(coalesce(candidate.reason, 'term_type_candidate'), ';resolved_by_manual_candidate_sql_20260610')
  FROM term_type_candidate_map map
  WHERE candidate.id::text = map.candidate_id
  RETURNING candidate.id
),
resolved_value_candidates AS (
  UPDATE quote_agent.dictionary_candidates candidate
  SET
    proposed_canonical_value = map.canonical_value,
    proposed_term_id = term.id,
    status = 'auto_resolved',
    reviewed_by = 'manual_sql',
    reviewed_at = now(),
    reason = concat(coalesce(candidate.reason, 'value_candidate'), ';resolved_by_manual_candidate_sql_20260610')
  FROM value_candidate_map map
  JOIN quote_agent.dictionary_terms term
    ON term.term_type = map.target_term_type
   AND term.canonical_value = map.canonical_value
  WHERE candidate.id::text = map.candidate_id
  RETURNING candidate.id
),
resolved_term_type_value_candidates AS (
  UPDATE quote_agent.dictionary_term_type_candidates candidate
  SET
    reason = concat(coalesce(candidate.reason, 'term_type_candidate'), ';value_alias_added_by_manual_candidate_sql_20260610'),
    updated_at = now()
  FROM term_type_candidate_value_map map
  WHERE candidate.id::text = map.candidate_id
  RETURNING candidate.id
)
SELECT
  (SELECT count(*) FROM upsert_new_term_types) AS term_type_upserts,
  (SELECT count(*) FROM upsert_term_type_aliases) AS term_type_alias_upserts,
  (SELECT count(*) FROM upsert_values) AS value_upserts,
  (SELECT count(*) FROM upsert_value_aliases) AS value_alias_upserts,
  (SELECT count(*) FROM resolved_term_type_candidates) AS resolved_term_type_candidates,
  (SELECT count(*) FROM resolved_value_candidates) AS resolved_value_candidates,
  (SELECT count(*) FROM resolved_term_type_value_candidates) AS term_type_candidate_value_aliases;

COMMIT;
