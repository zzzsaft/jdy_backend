import { PgDataSource } from './build/src/config/data-source.js';

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT candidate_type, candidate_id, recommended_action, suggestion, model, confidence
    FROM quote_agent.dictionary_candidate_review_suggestions
    WHERE candidate_type = 'term_type'
      AND (candidate_id::text) IN ('859','1011','832','836','519','764','615','588','928','1045','1062','536','895','888')
    ORDER BY candidate_id::int
  `);
  console.log(JSON.stringify(rows, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (error)=>{console.error(error); if(PgDataSource.isInitialized) await PgDataSource.destroy(); process.exit(1);});
