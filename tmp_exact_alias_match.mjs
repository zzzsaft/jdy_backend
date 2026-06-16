import { PgDataSource } from './build/src/config/data-source.js';

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT
      c.id,
      c.source_product_type,
      c.raw_field_name,
      c.normalized_field_name,
      a.term_type,
      a.alias_name,
      c.raw_value
    FROM quote_agent.dictionary_term_type_candidates c
    JOIN quote_agent.dictionary_term_type_aliases a
      ON a.normalized_alias_name = c.normalized_field_name
     AND a.is_active = true
    WHERE c.status = 'pending'
    ORDER BY c.id::int
  `);
  console.log(JSON.stringify(rows, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (e)=>{console.error(e); if(PgDataSource.isInitialized) await PgDataSource.destroy(); process.exit(1);});
