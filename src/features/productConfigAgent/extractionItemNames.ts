import type { DataSource } from "typeorm";

type QueryableDataSource = Pick<DataSource, "query">;

type ExtractionItemNameRow = {
  extractionResultId: number;
  itemIndex: string | null;
  itemName: string | null;
};

export async function buildExtractionItemNameMap(
  dataSource: QueryableDataSource,
  extractionResultIds: Array<number | string>
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      extractionResultIds
        .map((id) => Number(id))
        .filter((id) => Number.isSafeInteger(id))
    ),
  ];
  if (ids.length === 0) {
    return new Map();
  }

  const rows = (await dataSource.query(
    `
      SELECT
        extraction.id AS "extractionResultId",
        COALESCE(item.value ->> 'item_index', item.value ->> 'itemIndex') AS "itemIndex",
        COALESCE(
          NULLIF(item.value ->> 'item_name', ''),
          item.value #>> '{item_name,value}',
          NULLIF(item.value ->> 'itemName', ''),
          item.value #>> '{itemName,value}'
        ) AS "itemName"
      FROM quote_agent.extraction_results extraction
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(extraction.normalized_extraction_json -> 'items') = 'array'
            THEN extraction.normalized_extraction_json -> 'items'
          WHEN jsonb_typeof(extraction.extraction_json -> 'items') = 'array'
            THEN extraction.extraction_json -> 'items'
          WHEN jsonb_typeof(extraction.extraction_json #> '{extraction,items}') = 'array'
            THEN extraction.extraction_json #> '{extraction,items}'
          ELSE '[]'::jsonb
        END
      ) AS item(value)
      WHERE extraction.id = ANY($1::int[])
    `,
    [ids]
  )) as ExtractionItemNameRow[];

  const result = new Map<string, string>();
  for (const row of rows) {
    if (row.itemIndex !== null && row.itemName) {
      result.set(`${row.extractionResultId}:${row.itemIndex}`, row.itemName);
    }
  }
  return result;
}
