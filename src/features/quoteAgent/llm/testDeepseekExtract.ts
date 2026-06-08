import "../../../config/env";
import { extractProductConfigWithDeepSeek } from "./deepseekExtract";
import {
  productionDetail231411FileName,
  productionDetail231411LlmText,
  productionDetail231411SheetName,
} from "./fixtures/productionDetail231411";

export async function main() {
  const result = await extractProductConfigWithDeepSeek({
    llmText: productionDetail231411LlmText,
    dictionaryContext: { term_types: [] },
    fileName: productionDetail231411FileName,
    sheetName: productionDetail231411SheetName,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
