import { PgDataSource } from './build/src/config/data-source.js';
import { DictionaryService } from './build/src/features/productConfigAgent/dictionary/dictionary.service.js';

const REVIEWER = 'codex';

function isObviousCandidate(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return false;
  if (value.length > 20) return false;
  if (/有：由|由电机|由.*组成|待客户确定|按最终双方图纸确认回传为准/.test(value)) return false;
  return true;
}

async function main() {
  await PgDataSource.initialize();
  const dictionaryService = new DictionaryService(PgDataSource);

  const rows = await PgDataSource.query(`
    SELECT c.id, c.raw_field_name, c.raw_value, a.term_type
    FROM quote_agent.dictionary_term_type_candidates c
    JOIN quote_agent.dictionary_term_type_aliases a
      ON a.normalized_alias_name = c.normalized_field_name
     AND a.is_active = true
    WHERE c.status = 'pending'
      AND c.normalized_field_name IS NOT NULL
    ORDER BY c.id::int
  `);

  const selected = rows.filter((row) => isObviousCandidate(row.raw_value));
  const actions = [];

  for (const row of selected) {
    try {
      await dictionaryService.approveTermTypeCandidateAsAlias({
        candidateId: row.id,
        termType: row.term_type,
        reviewedBy: REVIEWER,
        appendApplicableProductType: true,
        bumpVersion: false,
      });
      actions.push({ id: row.id, termType: row.term_type, status: 'ok' });
    } catch (error) {
      actions.push({
        id: row.id,
        termType: row.term_type,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const skipped = rows
    .filter((row) => !isObviousCandidate(row.raw_value))
    .map((row) => ({ id: row.id, raw_value: row.raw_value }));

  console.log(JSON.stringify({ selectedCount: selected.length, skippedCount: skipped.length, actions, skipped }, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (error) => {
  console.error(error);
  if (PgDataSource.isInitialized) {
    await PgDataSource.destroy();
  }
  process.exit(1);
});
