# Normalization Rules

Exception-style normalization guards live here so they can be audited without
reading the whole normalization pipeline.

- `documentInfoRules.ts`: moves document-level fields out of product items.
- `productRedirectRules.ts`: redirects high-confidence fields to a better item
  product type in the same extraction.
- `rangeBoundRules.ts`: merges min/max field-name variants into one range field.
- `numberUnitPartRules.ts`: merges value/unit field-name variants into one
  number-unit field.
- `indexedInstanceRules.ts`: treats trailing digits on known field names as
  item instance indexes instead of term-type names.
- `selectionSplitRules.ts`: removes selected/unselected markers from LLM
  `split_fields` and drops explicitly unselected split options.
