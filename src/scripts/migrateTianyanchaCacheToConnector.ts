import { DataSource } from "typeorm";
import { spawn } from "node:child_process";
import { CustomerInfo } from "../entity/crm/customerInfo.js";
import { CustomerSearch } from "../entity/crm/customerSearch.js";

type CacheImportEntry = {
  operation: "search" | "base-info";
  keyword: string;
  response: Record<string, unknown>;
  sourceFetchedAt?: string;
};

const searchCompanyType: Record<string, number> = {
  公司: 1,
  香港企业: 2,
  社会组织: 3,
  律所: 4,
  事业单位: 5,
  基金会: 6,
  "不存在法人、注册资本、统一社会信用代码、经营状态": 7,
  台湾企业: 8,
  新机构: 9,
};

const dateFields = [
  "fromTime",
  "approvedTime",
  "updateTimes",
  "estiblishTime",
  "toTime",
  "revokeDate",
  "cancelDate",
] as const;

export function customerInfoCacheEntry(info: CustomerInfo): CacheImportEntry {
  const result: Record<string, unknown> = { ...(info as unknown as Record<string, unknown>) };
  delete result.createdAt;
  for (const field of dateFields) result[field] = epochMillis(result[field]);
  result.type = info.type === "人" ? 1 : 2;
  result.isMicroEnt = info.isMicroEnt === "是" ? 1 : 0;
  result.staffList = {
    result: (info.staffList ?? []).map((staff) => ({
      id: staff.id,
      name: staff.name,
      typeJoin: staff.position,
      type: staff.type === "公司" ? 1 : 2,
    })),
  };
  result.industryAll = {
    category: info.category,
    categoryBig: info.categoryBig,
    categoryMiddle: info.categoryMiddle,
    categorySmall: info.categorySmall,
  };
  return {
    operation: "base-info",
    keyword: info.name,
    response: { error_code: 0, reason: "ok", result },
    sourceFetchedAt: rfc3339(info.createdAt),
  };
}

export function customerSearchCacheEntry(keyword: string, rows: CustomerSearch[]): CacheImportEntry {
  const items = rows.map((row) => ({
    regNumber: row.regNumber,
    regStatus: row.regStatus,
    creditCode: row.creditCode,
    estiblishTime: epochMillis(row.estiblishTime),
    regCapital: row.regCapital,
    companyType: searchCompanyType[row.companyType] ?? row.companyType,
    name: row.name,
    id: row.company_id,
    orgNumber: row.orgNumber,
    type: row.type === "公司" ? 1 : 2,
    base: row.base,
    legalPersonName: row.legalPersonName,
    matchType: row.matchType,
  }));
  const fetchedAt = rows
    .map((row) => row.createdAt)
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return {
    operation: "search",
    keyword,
    response: { error_code: 0, reason: "ok", result: { items, total: items.length } },
    sourceFetchedAt: rfc3339(fetchedAt),
  };
}

function epochMillis(value: unknown): number | null {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function rfc3339(value: Date | null | undefined): string | undefined {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
}

async function importBatch(baseURL: string, token: string, sshTarget: string, sshPort: string, entries: CacheImportEntry[]) {
  if (sshTarget) return await importBatchOverSsh(sshTarget, sshPort, entries);
  const response = await fetch(`${baseURL}/v1/admin/providers/tianyancha/cache/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Connect cache import failed (HTTP ${response.status})`);
  return (await response.json()) as { processed: number; inserted: number; skipped: number };
}

async function importBatchOverSsh(sshTarget: string, sshPort: string, entries: CacheImportEntry[]) {
  const remoteCommand = [
    "set -eu",
    "token=$(grep '^CONNECTOR_ADMIN_TOKEN=' /volume1/docker/integration-connector/.env.production | cut -d= -f2-)",
    "test -n \"$token\"",
    "curl -fsS --max-time 30 -X POST -H \"Authorization: Bearer $token\" -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:2027/v1/admin/providers/tianyancha/cache/import",
  ].join("; ");
  return await new Promise<{ processed: number; inserted: number; skipped: number }>((resolve, reject) => {
    const child = spawn("ssh", ["-p", sshPort, "-o", "ConnectTimeout=10", sshTarget, remoteCommand], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 45_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Connect SSH cache import failed (exit ${code}): ${stderr.trim().slice(0, 300)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Connect SSH cache import returned invalid JSON"));
      }
    });
    child.stdin.end(JSON.stringify({ entries }));
  });
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const baseURL = String(process.env.CONNECTOR_ADMIN_BASE_URL ?? process.env.CONNECTOR_BASE_URL ?? "").replace(/\/$/, "");
  const token = String(process.env.CONNECTOR_ADMIN_TOKEN ?? "").trim();
  const sshTarget = String(process.env.CONNECTOR_ADMIN_SSH_TARGET ?? "").trim();
  const sshPort = String(process.env.CONNECTOR_ADMIN_SSH_PORT ?? "24").trim();
  if (!dryRun && !sshTarget && (!baseURL || !token)) throw new Error("Set CONNECTOR_ADMIN_SSH_TARGET, or configure CONNECTOR_ADMIN_BASE_URL and CONNECTOR_ADMIN_TOKEN");

  const migrationDataSource = new DataSource({
    type: "postgres",
    host: process.env.PgHost,
    port: Number(process.env.PgPort ?? 5433),
    username: process.env.PgUser,
    password: process.env.PgPassword,
    database: process.env.PgDatabase ?? process.env.PgUser,
    entities: [CustomerInfo, CustomerSearch],
    synchronize: false,
    logging: false,
  });
  await migrationDataSource.initialize();
  let imported = 0;
  try {
    const infoRepository = migrationDataSource.getRepository(CustomerInfo);
    const searchRepository = migrationDataSource.getRepository(CustomerSearch);
    const infoCount = await infoRepository.count();
    const searchRowCount = await searchRepository.count();
    const keywordCount = await searchRepository
      .createQueryBuilder("search")
      .select("COUNT(DISTINCT search.keyWord)", "count")
      .getRawOne<{ count: string | number }>();
    if (dryRun) {
      console.info(`[tianyancha-cache-migration] dryRun=true baseInfo=${infoCount} searchRows=${searchRowCount} searchKeywords=${Number(keywordCount?.count ?? 0)}`);
      return;
    }
    const batchSize = 100;
    for (let offset = 0; ; offset += batchSize) {
      const rows = await infoRepository.find({ order: { id: "ASC" }, skip: offset, take: batchSize });
      if (rows.length === 0) break;
      const result = await importBatch(baseURL, token, sshTarget, sshPort, rows.map(customerInfoCacheEntry));
      imported += result.inserted;
    }

    const searchRows = await searchRepository.find({ order: { keyWord: "ASC", id: "ASC" } });
    const groupedSearchRows = new Map<string, CustomerSearch[]>();
    for (const row of searchRows) {
      const group = groupedSearchRows.get(row.keyWord) ?? [];
      group.push(row);
      groupedSearchRows.set(row.keyWord, group);
    }
    const searchEntries = [...groupedSearchRows].map(([keyword, rows]) => customerSearchCacheEntry(keyword, rows));
    for (let offset = 0; offset < searchEntries.length; offset += batchSize) {
      const result = await importBatch(baseURL, token, sshTarget, sshPort, searchEntries.slice(offset, offset + batchSize));
      imported += result.inserted;
    }
    console.info(`[tianyancha-cache-migration] imported=${imported} baseInfo=${infoCount} searchRows=${searchRowCount} searchKeywords=${searchEntries.length}`);
  } finally {
    await migrationDataSource.destroy();
  }
}

if (process.argv[1]?.endsWith("migrateTianyanchaCacheToConnector.ts") || process.argv[1]?.endsWith("migrateTianyanchaCacheToConnector.js")) {
  run().catch((error) => {
    console.error(`[tianyancha-cache-migration] failed=${error instanceof Error ? error.message : "unknown"}`);
    process.exitCode = 1;
  });
}
