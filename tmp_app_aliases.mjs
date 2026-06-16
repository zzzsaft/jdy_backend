import { PgDataSource } from './build/src/config/data-source.js';

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT id, alias_name, source
    FROM quote_agent.dictionary_term_type_aliases
    WHERE term_type = 'application'
    ORDER BY alias_name
  `);
  console.log(JSON.stringify(rows, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (error)=>{console.error(error); if(PgDataSource.isInitialized) await PgDataSource.destroy(); process.exit(1);});
