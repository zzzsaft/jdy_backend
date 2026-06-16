import { PgDataSource } from './build/src/config/data-source.js';

function isShort(s) {
  return s.replace(/[\s\t\n\r]/g, '').length <= 8;
}

async function main() {
  await PgDataSource.initialize();
  const rows = await PgDataSource.query(`
    SELECT id, source_product_type, raw_field_name, normalized_field_name, reason, raw_value
    FROM quote_agent.dictionary_term_type_candidates
    WHERE status = 'pending'
      AND reason = 'term_type_no_match'
    ORDER BY source_product_type, normalized_field_name, id
  `);
  const picked = rows.filter((row) => {
    const s = String(row.normalized_field_name || '');
    const t = String(row.raw_field_name || '');
    if ((s.length <= 8 || t.length <= 8) && /[\u4e00-\u9fff]/.test(s + t)) return true;
    return /^(a层|b层|c层|d层|A层|B层|1层|2层|3层|用途|应用|领域|材质|规格|功率|压力|型号|品牌|产量|数量|温度|数量|电压|宽度|高度|长度|形状|工艺)$/.test(s) || /^(a层|b层|c层|d层|A层|B层|1层|2层|3层|用途|应用|领域|材质|规格|功率|压力|型号|品牌|产量|数量|温度|温|长度|宽度|高度|形状|工艺)$/.test(t);
  });
  console.log(JSON.stringify(picked.slice(0, 200), null, 2));
  await PgDataSource.destroy();
}

main().catch(async (error) => {
  console.error(error);
  if (PgDataSource.isInitialized) await PgDataSource.destroy();
  process.exit(1);
});
