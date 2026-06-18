export const PRODUCT_CONFIG_AGENT_HEALTH_SCHEMA = "productConfigAgent";

export function productConfigAgentSourceSchema(): string {
  return (
    process.env.PRODUCT_CONFIG_AGENT_SOURCE_SCHEMA?.trim() ||
    process.env.PRODUCT_CONFIG_AGENT_LEGACY_SOURCE_SCHEMA?.trim() ||
    "quote_agent"
  );
}

export function qualifiedTable(schema: string, table: string): string {
  return `"${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`;
}
