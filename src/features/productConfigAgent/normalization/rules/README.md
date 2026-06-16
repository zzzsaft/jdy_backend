# Normalization Rules

Exception-style normalization guards live here so they can be audited without
reading the whole normalization pipeline.

- `documentInfoRules.ts`: moves document-level fields out of product items.
- `productRedirectRules.ts`: redirects high-confidence fields to a better item
  product type in the same extraction.
- `rangeBoundRules.ts`: merges min/max field-name variants into one range field.
