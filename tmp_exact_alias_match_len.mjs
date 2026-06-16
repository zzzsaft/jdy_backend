import { PgDataSource } from './build/src/config/data-source.js';

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT c.id, c.raw_field_name, c.normalized_field_name, c.raw_value, a.term_type
    FROM quote_agent.dictionary_term_type_candidates c
    JOIN quote_agent.dictionary_term_type_aliases a
      ON a.normalized_alias_name = c.normalized_field_name
     AND a.is_active = true
    WHERE c.status = 'pending'
    ORDER BY c.id::int
  `);
  const picked = rows.map((r) => ({
    id: r.id,
    raw_field_name: r.raw_field_name,
    term_type: r.term_type,
    raw_value: r.raw_value,
    raw_value_len: String(r.raw_value ?? '').length,
  }));
  console.log(JSON.stringify(picked, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (error)=>{console.error(error); if(PgDataSource.isInitialized) await PgDataSource.destroy(); process.exit(1);});
