import { buildLlmText } from "../excelParser/index.js";
import {
  extractProductConfigWithLLM,
  extractProductConfigWithTwoStageXh,
} from "../extraction/index.js";
import { getFirstSheetName, TWO_STAGE_PROMPT_VERSION } from "./common.js";
import type { ExtractWithLLMParams } from "./types.js";

export async function extractWithLLM(params: ExtractWithLLMParams) {
  const llmText = params.blocksJson.llm_text || buildLlmText(params.blocksJson);

  if (params.promptVersion === TWO_STAGE_PROMPT_VERSION) {
    return extractProductConfigWithTwoStageXh(
      {
        llmText,
        textBlocks: params.blocksJson.blocks,
        blocksJson: params.blocksJson,
        dictionaryContext: params.dictionaryContext,
        fileName: params.blocksJson.file_name ?? params.fileName,
        sheetName: getFirstSheetName(params.blocksJson),
        onStreamProgress: params.onStreamProgress,
      },
      params.llmModel,
    );
  }

  return extractProductConfigWithLLM(
    {
      llmText,
      dictionaryContext: params.dictionaryContext,
      fileName: params.blocksJson.file_name ?? params.fileName,
      sheetName: getFirstSheetName(params.blocksJson),
      onStreamProgress: params.onStreamProgress,
    },
    params.llmModel,
  );
}
