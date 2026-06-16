import { PgDataSource } from './build/src/config/data-source.js';

function hasSimpleChinese(s) {
  return /用途|应用|使用领域|使用|产\s*品\s*使用|领域/.test(s);
}

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT id, source_product_type, raw_field_name, normalized_field_name, raw_value
    FROM quote_agent.dictionary_term_type_candidates
    WHERE status = 'pending'
      AND reason = 'term_type_no_match'
      AND (
        normalized_field_name ~* '使用|用途|应用|应用描述|领域|国产|出口|国内'
        OR raw_field_name ~* '使用|用途|应用|应用描述|领域|国产|出口|国内'
      )
    ORDER BY source_product_type, id
  `);
  const normalized = rows.map(r => ({
    id: r.id,
    source_product_type: r.source_product_type,
    raw_field_name: r.raw_field_name,
    normalized_field_name: r.normalized_field_name,
    raw_value: r.raw_value,
    raw_value_len: String(r.raw_value ?? '').length,
  }));
  console.log(JSON.stringify(normalized, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (error)=>{console.error(error); if(PgDataSource.isInitialized) await PgDataSource.destroy(); process.exit(1);});
