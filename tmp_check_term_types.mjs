import { PgDataSource } from './build/src/config/data-source.js';

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT term_type, display_name, is_active, value_kind, applicable_product_types
    FROM quote_agent.dictionary_term_types
    WHERE term_type IN ('application', 'product_type', 'application_field')
    ORDER BY term_type
  `);
  console.log(JSON.stringify(rows, null, 2));
  const active = await PgDataSource.query(`
    SELECT term_type, display_name
    FROM quote_agent.dictionary_term_types
    WHERE is_active = true AND value_kind IS NOT NULL
    ORDER BY term_type
    LIMIT 5
  `);
  console.log('active sample', JSON.stringify(active, null, 2));
  await PgDataSource.destroy();
}
main().catch(async (error)=>{console.error(error); const {PgDataSource}=await import('./build/src/config/data-source.js'); if (PgDataSource.isInitialized) await PgDataSource.destroy(); process.exit(1);});
