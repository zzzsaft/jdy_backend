import { PgDataSource } from './build/src/config/data-source.js';

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT id, source_product_type, raw_field_name, normalized_field_name, reason, raw_value
    FROM quote_agent.dictionary_term_type_candidates
    WHERE status = 'pending'
      AND (
        normalized_field_name ILIKE '%application%'
        OR normalized_field_name ILIKE '%应用%'
        OR normalized_field_name ILIKE '%用途%'
        OR normalized_field_name ILIKE '%场景%'
        OR normalized_field_name ILIKE '%领域%'
        OR raw_field_name ILIKE '%应用%'
        OR raw_field_name ILIKE '%用途%'
        OR raw_field_name ILIKE '%场景%'
        OR raw_field_name ILIKE '%领域%'
      )
    ORDER BY source_product_type, normalized_field_name, id
  `);
  console.log(JSON.stringify(rows, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (error) => {
  console.error(error);
  if (PgDataSource.isInitialized) {
    await PgDataSource.destroy();
  }
  process.exit(1);
});
