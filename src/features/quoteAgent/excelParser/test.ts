import { parseExcel, parseOptionsFromText } from "./index";

const localFilePath =
  "/Users/zzzsaft/Documents/生产明细单/jxyxbyy/2023/生产明细（231411）2023-06-10-1900mmCPE流延膜手动模头.xls";

export async function main() {
  const optionSamples = [
    "■方形（            ）芯             □特殊",
    "□  有　　数量：共（          ）件　     　■ 没有",
    "模头编号：231411      客户ID：30019             ■国内使用                □出口使用          国家（        ）",
    "模体（    9   ）区          两侧板□有    ■没有     模唇□有    ■没有",
  ];

  console.log("Option parser samples:");
  // optionSamples.forEach((sample, index) => {
  //   console.log(
  //     JSON.stringify(
  //       {
  //         index: index + 1,
  //         raw_text: sample,
  //         result: parseOptionsFromText(sample),
  //       },
  //       null,
  //       2
  //     )
  //   );
  // });

  const result = await parseExcel(localFilePath, {
    parseTextboxes: true,
    keepTempFile: false,
    includeRowBlocks: false,
    xlsMode: "direct-first",
    buildLlmText: true,
  });

  if (!result.success) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // console.log(
  //   JSON.stringify(
  //     {
  //       success: result.success,
  //       file_name: result.data.file_name,
  //       source_type: result.data.source_type,
  //       block_count: result.data.blocks.length,
  //       preview_blocks: result.data.blocks.slice(0, 10),
  //       llm_text_preview: result.data.llm_text?.slice(0, 2000),
  //     },
  //     null,
  //     2
  //   )
  // );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
