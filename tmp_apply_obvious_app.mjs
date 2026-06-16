import { PgDataSource } from './build/src/config/data-source.js';
import { DictionaryService } from './build/src/features/productConfigAgent/dictionary/dictionary.service.js';

async function main() {
  await PgDataSource.initialize();
  const dictionaryService = new DictionaryService(PgDataSource);
  const targetIds = ['859', '832', '836', '1011'];
  const results = [];

  for (const id of targetIds) {
    try {
      await dictionaryService.approveTermTypeCandidateAsAlias({
        candidateId: id,
        termType: 'application',
        reviewedBy: 'codex',
        bumpVersion: false,
      });
      results.push({ id, status: 'ok' });
    } catch (error) {
      results.push({ id, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(JSON.stringify(results, null, 2));
  await PgDataSource.destroy();
}

main().catch(async (error) => {
  console.error(error);
  if (PgDataSource.isInitialized) {
    await PgDataSource.destroy();
  }
  process.exit(1);
});
