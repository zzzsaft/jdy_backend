import { PgDataSource } from './build/src/config/data-source.js';

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT t.id, t.canonical_value, t.display_name
    FROM quote_agent.dictionary_terms t
    WHERE t.term_type='application' AND t.is_active=true
    ORDER BY t.display_name
  `);
  const aliases = await PgDataSource.query(`
    SELECT ta.term_id, ta.alias_value
    FROM quote_agent.dictionary_aliases ta
    JOIN quote_agent.dictionary_terms t ON t.id = ta.term_id
    WHERE t.term_type='application' AND t.is_active=true
      AND ta.is_active=true
    ORDER BY t.display_name, ta.alias_value
  `);
  console.log('terms',JSON.stringify(rows, null, 2));
  console.log('aliases',JSON.stringify(aliases, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (e)=>{console.error(e); if(PgDataSource.isInitialized) await PgDataSource.destroy(); process.exit(1);});
