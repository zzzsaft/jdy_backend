ALTER TABLE quote_agent.contract_archive_item_products
  DROP COLUMN IF EXISTS price_amount,
  DROP COLUMN IF EXISTS price_currency,
  DROP COLUMN IF EXISTS price_source;
