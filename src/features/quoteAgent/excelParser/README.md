# Quote Agent Excel Parser

这个模块是一个 **LLM-friendly Excel text extractor**。它负责把合同、报价、生产明细类 Excel 文件解析成稳定的 `blocks[]`，供后续 LLM 做产品配置字段的语义抽取和结构化。

它不是最终业务字段解析器，也不负责入库。

## 能力边界

- 读取 `.xlsx` / `.xls` 文件。
- 保留 sheet 名称、单元格坐标、行列号、合并单元格范围、原始文本 `raw_text`。
- 将黑框、勾选框等选项符号标准化为 `[SEL]` 和 `[ ]`。
- 生成适合输入 LLM 的 `text`。
- 可选解析 `.xlsx` 文本框中的文字。
- 额外生成压缩后的 `llm_text`，推荐直接作为第一轮 LLM 结构化解析输入。
- 不解析 Excel 图片。
- 不做 OCR。
- 不在 Node.js 阶段维护大量业务字段词典或最终入库字段映射。

## 调用方式

```ts
import { parseExcel } from "./src/features/quoteAgent/excelParser";

async function main() {
  const result = await parseExcel("./uploads/生产明细.xls", {
    parseTextboxes: true,
    keepTempFile: false,
    includeRowBlocks: false,
    xlsMode: "direct-first",
    buildLlmText: true,
  });

  console.log(JSON.stringify(result, null, 2));
}

main();
```

URL 模式：

```ts
import { parseExcel } from "./src/features/quoteAgent/excelParser";

async function main() {
  const result = await parseExcel("https://example.com/生产明细.xlsx", {
    parseTextboxes: true,
    keepTempFile: false,
    includeRowBlocks: false,
    xlsMode: "direct-first",
    buildLlmText: true,
  });

  console.log(JSON.stringify(result, null, 2));
}

main();
```

也可以显式调用：

```ts
import {
  parseExcelFromLocalFile,
  parseExcelFromUrl,
} from "./src/features/quoteAgent/excelParser";

await parseExcelFromLocalFile("./uploads/生产明细.xlsx");
await parseExcelFromUrl("https://example.com/生产明细.xlsx");
```

## Options

```ts
{
  parseTextboxes: true,
  keepTempFile: false,
  includeRowBlocks: false,
  xlsMode: "direct-first",
  buildLlmText: true,
  llmTextOptions: {
    mode: "row",
    includeInstruction: true,
    includeFileMeta: true,
    includeSheetName: true,
    includeEmptyCells: false,
    includeMergeContext: true,
    skipHeaderLikeRows: true
  }
}
```

- `parseTextboxes`：是否尝试解析 `.xlsx` drawing XML 中的文本框。
- `keepTempFile`：URL 下载和 `.xls` 转换产生的临时文件是否保留，默认删除。
- `includeRowBlocks`：是否额外生成 row block，默认关闭，避免重复输入 LLM。
- `xlsMode`：`.xls` 解析模式，默认 `direct-first`。
  - `direct-first`：先用 `xlsx` / SheetJS 直接解析 `.xls`，失败后再尝试 LibreOffice 转换。
  - `direct`：只用 `xlsx` / SheetJS 直接解析 `.xls`，不调用 LibreOffice。
  - `convert`：强制使用 LibreOffice 转换成 `.xlsx` 后再解析。
- `buildLlmText`：是否在成功返回时生成 `data.llm_text`，默认开启。
- `llmTextOptions`：控制 `llm_text` 输出格式。
  - `mode`：`row` 按行聚合输出，`cell` 逐单元格输出。
  - `includeMergeContext`：默认 `true`。在 row 模式中，如果当前行落在 A 列纵向合并单元格内，且本行没有 A 列文本，会补充 `上下文：...`。
  - `skipHeaderLikeRows`：默认 `true`。跳过明显标题、表单编号、内部保密提示等标题/表头类行。

## LLM 输入文本

`blocks[]` 是完整追溯数据，包含 `raw_text`、`options`、`source.sheet_range`、`source.merge_range` 等字段。它适合调试、追溯原始 Excel 单元格，不建议作为第一轮 LLM 输入直接完整传入。

`llm_text` 是给 LLM 的压缩文本输入，默认按 sheet 和 row 聚合，只保留文件来源、说明、Excel 坐标和标准化后的 cell 文本。

默认情况下，`llm_text` 会做两类只影响 LLM 输入的优化，不会修改原始 `blocks[]`：

- 纵向合并单元格上下文补全：例如 A42:A45 是 `电镀`，Row 43 会输出 `上下文：电镀`。
- 标题/表头类行过滤：例如只包含 `QR8.2-04`、`生产明细表`、`内部使用`、`注意保密` 的行默认不进入 `llm_text`。

可以关闭这些行为：

```ts
const result = await parseExcel("./uploads/生产明细.xls", {
  llmTextOptions: {
    includeMergeContext: false,
    skipHeaderLikeRows: false,
  },
});
```

推荐第一轮结构化时使用：

```ts
const result = await parseExcel("./uploads/生产明细.xls");

if (result.success) {
  const llmInput = result.data.llm_text;
  // 将 llmInput 放入 prompt，由 LLM 输出结构化产品配置 JSON。
}
```

也可以单独调用：

```ts
import { buildLlmText } from "./src/features/quoteAgent/excelParser";

const llmText = buildLlmText(parsedResult, {
  mode: "cell",
  includeInstruction: true,
  includeFileMeta: true,
  includeSheetName: true,
  includeEmptyCells: false,
  includeMergeContext: true,
  skipHeaderLikeRows: true,
});
```

默认 `row` 模式示例：

```text
文件名：生产明细（231411）2023-06-10-1900mmCPE流延膜手动模头.xls
来源：local

说明：
[SEL] 表示该选项被选中。
[ ] 表示该选项未选中。
请以后续结构化时只根据 [SEL] 判断最终选中项；[ ] 只作为候选项参考。
空括号表示未填写。
文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。

Sheet：生产明细表

Row 3:
[A3]
模头编号：231411
客户ID：30019
[SEL] 国内使用
[ ] 出口使用
国家（        ）
```

如果需要定位原 Excel 单元格，使用 `blocks[]` 中的 `source` 字段，例如 `source.sheet_name`、`source.cell`、`source.row`、`source.col`。

`[SEL]` 表示选中，`[ ]` 表示未选中。未选中项不会被删除，因为它能帮助 LLM 理解候选项范围。

## 返回结构

成功：

```json
{
  "success": true,
  "data": {
    "file_name": "生产明细.xlsx",
    "source_type": "local",
    "blocks": [],
    "llm_text": "文件名：生产明细.xlsx\n来源：local\n..."
  }
}
```

cell block：

```json
{
  "block_id": "Sheet1_A1",
  "type": "cell",
  "text": "模头编号：230004\n客户ID：10018\n[SEL] 国内使用\n[ ] 出口使用\n国家（    ）",
  "raw_text": "模头编号：230004    客户ID：10018    ■国内使用  □出口使用    国家（    ）",
  "options": [
    {
      "selected": true,
      "label": "国内使用",
      "normalized": "[SEL] 国内使用"
    }
  ],
  "source": {
    "sheet_name": "Sheet1",
    "kind": "cell",
    "cell": "A1",
    "row": 1,
    "col": 1,
    "sheet_range": "A1:H30",
    "merge_range": null
  }
}
```

失败：

```json
{
  "success": false,
  "error": {
    "code": "EXCEL_PARSE_FAILED",
    "message": "Excel 解析失败"
  }
}
```

## .xls 支持

`.xls` 是旧版 Excel 二进制格式。模块中已预留 LibreOffice headless 转换能力：

默认模式是 `xlsMode: "direct-first"`，会优先使用 `xlsx` / SheetJS 直接读取 `.xls` 单元格文本；如果直接读取失败，再尝试 LibreOffice 转换。

如果服务器不方便安装 LibreOffice，可以使用：

```ts
await parseExcel("./uploads/生产明细.xls", {
  xlsMode: "direct",
});
```

如果用户需要最大兼容性，可以使用：

```ts
await parseExcel("./uploads/生产明细.xls", {
  xlsMode: "convert",
});
```

LibreOffice 转换命令：

```bash
soffice --headless --convert-to xlsx --outdir temp input.xls
```

当使用 `xlsMode: "convert"`，或 `direct-first` 直读失败并进入转换后，运行环境需要安装 LibreOffice，并确保 `soffice` 在 `PATH` 中。未安装时会返回清晰错误：

```json
{
  "success": false,
  "error": {
    "code": "LIBREOFFICE_NOT_INSTALLED",
    "message": ".xls 文件解析需要安装 LibreOffice，并确保 soffice 可执行文件在 PATH 中"
  }
}
```

`.xlsx` 文件不依赖 LibreOffice，可直接解析。

注意：`xlsx` / SheetJS 直接读取 `.xls` 通常可以获取单元格文本，但旧版 `.xls` 中的文本框、控件、复杂对象可能无法完整读取。

## 文本框支持状态

当前会读取 `.xlsx` 内部的 `xl/drawings/drawing*.xml`，尝试提取 shape / `txBody` 中的文字，并输出 `type: "paragraph"` 的 block。

第一阶段暂未完整解析 worksheet relationship，因此文本框的 `source.sheet_name` 为 `UNKNOWN_NEED_REL_MAPPING`。文本框解析失败不会影响普通单元格解析。

## 后续入库位置

建议流程：

1. 当前模块输出完整 `blocks[]` 和压缩 `llm_text`。
2. 将 `llm_text` 输入 LLM。
3. LLM 输出结构化产品配置字段。
4. 在 LLM 结构化结果校验通过后，再接数据库写入逻辑。

不要在当前 Node.js Excel 解析阶段直接做最终业务字段入库。
