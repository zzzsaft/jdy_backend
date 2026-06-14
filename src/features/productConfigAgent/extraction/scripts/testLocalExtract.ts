import "../../../../config/env.js";
import { extractProductConfigWithLocalModel } from "../providers/localExtract.js";
import {
  productionDetail231411FileName,
  productionDetail231411LlmText,
  productionDetail231411SheetName,
} from "./fixtures/productionDetail231411.js";

export async function main() {
  const result = await extractProductConfigWithLocalModel(
    {
      llmText: productionDetail231411LlmText,
      dictionaryContext: { term_types: [] },
      fileName: productionDetail231411FileName,
      sheetName: productionDetail231411SheetName,
    },
    process.env.LOCAL_LLM_MODEL || "gemma4:12b"
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
