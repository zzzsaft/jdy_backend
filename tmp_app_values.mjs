import { PgDataSource } from './build/src/config/data-source.js';

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT id, source_product_type, raw_value, normalized_raw_value, confidence, status, created_at
    FROM quote_agent.dictionary_candidates
    WHERE status='pending' AND term_type='application'
    ORDER BY id::int
  `);
  const shortRows = rows.map((row)=>({
    id: row.id,
    source_product_type: row.source_product_type,
    raw_value: row.raw_value,
    normalized_raw_value: row.normalized_raw_value,
    confidence: row.confidence
  }));
  console.log(JSON.stringify(shortRows, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (e)=>{console.error(e); if(PgDataSource.isInitialized) await PgDataSource.destroy(); process.exit(1);});
