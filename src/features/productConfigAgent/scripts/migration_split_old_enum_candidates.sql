-- Migration: Split old candidates for term types changed to enums
-- 适用场景：运行完 migration_add_enums_value_kind.sql 之后
-- 旧 candidate（reason='value_no_match'）存的是完整复合值（如 "CPE流延缠绕膜"），
-- 不符合新 enums 流程需要的 token 粒度。
--
-- 本脚本：
-- 1. 找出旧 candidate（term_type 在 enums 列表中、reason='value_no_match'、status='pending'）
-- 2. 按分隔符（、，,;；/+）拆分 raw_value，指定 term type 还按空格进一步拆分
-- 3. 对每个 token，如果不在 alias 中也没有其他 pending candidate，则生成新 candidate
-- 4. 将旧 candidate 置为 rejected

DO $$
DECLARE
  v_candidate RECORD;
  v_token text;
  v_token_normalized text;
  v_exists boolean;
  v_allow_space boolean;
  v_parts text[];
  v_part text;
  v_seen text[];
  v_enums_term_types text[] := ARRAY[
    'applicable_plastic_material',
    'applicable_process_type',
    'application_type',
    'surface_treatment_requirement',
    'accessory_list'
  ];
  v_count_old int := 0;
  v_count_new int := 0;
  v_count_skipped int := 0;
  v_count_no_split int := 0;
BEGIN

  RAISE NOTICE 'Processing old pending candidates for enums term types...';

  FOR v_candidate IN
    SELECT
      c.id,
      c.term_type,
      c.raw_value,
      c.normalized_raw_value,
      c.document_id,
      c.extraction_result_id,
      c.item_index,
      c.source_product_type,
      c.evidence
    FROM quote_agent.dictionary_candidates c
    WHERE c.term_type = ANY(v_enums_term_types)
      AND c.reason = 'value_no_match'
      AND c.status = 'pending'
    ORDER BY c.id
  LOOP
    v_count_old := v_count_old + 1;
    v_allow_space := (v_candidate.term_type = ANY(v_enums_term_types));
    v_seen := '{}';

    -- Fallback: if raw_value is empty/null, just reject
    IF v_candidate.raw_value IS NULL OR TRIM(v_candidate.raw_value) = '' THEN
      UPDATE quote_agent.dictionary_candidates
      SET
        status = 'rejected',
        reason = 'superseded_by_enums_migration',
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = v_candidate.id;
      CONTINUE;
    END IF;

    -- Split by delimiters: 、，,;；/+
    -- (Delimiter matches TypeScript /[、，,;；\/＋+\\n]/ minus the dubious "\\n")
    v_parts := ARRAY(
      SELECT DISTINCT LOWER(TRIM(part))
      FROM regexp_split_to_table(v_candidate.raw_value, '[、，,;；/＋+]+') AS part
      WHERE TRIM(part) != ''
    );

    -- For space-split-aware term types, split each part further by whitespace
    IF v_allow_space THEN
      v_parts := ARRAY(
        SELECT DISTINCT LOWER(TRIM(unnested))
        FROM (
          SELECT UNNEST(v_parts) AS item
        ) items,
        LATERAL regexp_split_to_table(items.item, '\s+') AS unnested
        WHERE TRIM(unnested) != ''
      );
    END IF;

    -- If no meaningful split happened (still the same as original), skip creation
    IF array_length(v_parts, 1) = 1
       AND v_parts[1] = LOWER(TRIM(v_candidate.raw_value)) THEN
      v_count_no_split := v_count_no_split + 1;
      UPDATE quote_agent.dictionary_candidates
      SET
        status = 'rejected',
        reason = 'superseded_by_enums_migration',
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = v_candidate.id;
      CONTINUE;
    END IF;

    -- Process each unique token
    FOREACH v_part IN ARRAY v_parts
    LOOP
      -- Normalize: matches TypeScript normalizeText()
      v_token_normalized := LOWER(REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(TRIM(v_part), '×', 'x', 'g'),
            '[()（）\[\]【】\-_：:;；,，、"''''''"]', '', 'g'
          ),
          '[■□☑✔✓]', '', 'g'
        ),
        '\s+', '', 'g'
      ));

      IF v_token_normalized = '' THEN
        CONTINUE;
      END IF;

      -- Skip if same as original (no meaningful split for this token)
      IF v_token_normalized = v_candidate.normalized_raw_value THEN
        CONTINUE;
      END IF;

      -- Dedup within same old candidate
      IF v_token_normalized = ANY(v_seen) THEN
        CONTINUE;
      END IF;
      v_seen := array_append(v_seen, v_token_normalized);

      -- Skip if this token already has an active alias
      SELECT EXISTS (
        SELECT 1
        FROM quote_agent.dictionary_aliases a
        WHERE a.term_type = v_candidate.term_type
          AND a.normalized_alias = v_token_normalized
          AND a.is_active = TRUE
      ) INTO v_exists;
      IF v_exists THEN
        v_count_skipped := v_count_skipped + 1;
        CONTINUE;
      END IF;

      -- Skip if there's already a pending candidate with same (term_type, normalized_raw_value)
      SELECT EXISTS (
        SELECT 1
        FROM quote_agent.dictionary_candidates c2
        WHERE c2.term_type = v_candidate.term_type
          AND c2.normalized_raw_value = v_token_normalized
          AND c2.status = 'pending'
          AND c2.id != v_candidate.id
      ) INTO v_exists;
      IF v_exists THEN
        v_count_skipped := v_count_skipped + 1;
        CONTINUE;
      END IF;

      -- Insert new candidate (matches createValueCandidate with reason='enums_token_no_match')
      INSERT INTO quote_agent.dictionary_candidates (
        document_id,
        extraction_result_id,
        item_index,
        source_product_type,
        term_type,
        raw_value,
        normalized_raw_value,
        proposed_canonical_value,
        proposed_term_id,
        reason,
        evidence,
        confidence,
        status,
        reviewed_by,
        reviewed_at,
        created_at,
        updated_at
      ) VALUES (
        v_candidate.document_id,
        v_candidate.extraction_result_id,
        v_candidate.item_index,
        v_candidate.source_product_type,
        v_candidate.term_type,
        v_part,
        v_token_normalized,
        NULL,
        NULL,
        'enums_token_no_match',
        JSON_BUILD_OBJECT(
          'sourceRawValue', v_candidate.raw_value,
          'splitFromRawValue', v_part,
          'originalEvidence', v_candidate.evidence
        ),
        NULL,
        'pending',
        NULL,
        NULL,
        NOW(),
        NOW()
      );

      v_count_new := v_count_new + 1;
    END LOOP;

    -- Mark old candidate as rejected
    UPDATE quote_agent.dictionary_candidates
    SET
      status = 'rejected',
      reason = 'superseded_by_enums_migration',
      reviewed_at = NOW(),
      updated_at = NOW()
    WHERE id = v_candidate.id;

    IF v_count_old % 50 = 0 THEN
      RAISE NOTICE '  Processed % old candidates...', v_count_old;
    END IF;

  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '========== Migration Summary ==========';
  RAISE NOTICE 'Old candidates processed:        %', v_count_old;
  RAISE NOTICE 'New token-level candidates created: %', v_count_new;
  RAISE NOTICE 'Tokens skipped (alias/dup exist): %', v_count_skipped;
  RAISE NOTICE 'Old candidates w/o split (raw kept as-is): %', v_count_no_split;
  RAISE NOTICE '========================================';

END $$;

-- Verify: remaining pending candidates for enums term types
SELECT
  tt.term_type,
  tt.display_name,
  c.reason,
  COUNT(*) AS count,
  MIN(c.raw_value) AS sample_raw_value
FROM quote_agent.dictionary_candidates c
JOIN quote_agent.dictionary_term_types tt ON tt.term_type = c.term_type
WHERE c.term_type IN (
  'applicable_plastic_material',
  'applicable_process_type',
  'application_type',
  'surface_treatment_requirement',
  'accessory_list'
)
  AND c.status = 'pending'
GROUP BY tt.term_type, tt.display_name, c.reason
ORDER BY tt.term_type, c.reason;
