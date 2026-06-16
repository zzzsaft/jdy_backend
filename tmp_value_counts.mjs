import { PgDataSource } from './build/src/config/data-source.js';

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT term_type, count(*)::int AS cnt
    FROM quote_agent.dictionary_candidates
    WHERE status = 'pending'
    GROUP BY term_type
    ORDER BY cnt DESC, term_type
    LIMIT 30
  `);
  console.log(JSON.stringify(rows, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (e)=>{console.error(e); if(PgDataSource.isInitialized) await PgDataSource.destroy(); process.exit(1);});
