import { logger } from "../../config/logger.js";
import { IRequestOptions } from "../../type/IType.js";

type ConnectorErrorBody = { error?: { message?: string } };

export class ApiClient {
  host: string;
  token: string;
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.host = (process.env.CONNECTOR_BASE_URL?.trim() || "http://integration-connector:4180").replace(/\/$/, "");
    this.token = process.env.CONNECTOR_JDY_BACKEND_TOKEN?.trim() || "";
    this.fetcher = fetcher;
  }

  /**
   * 保留原天眼查客户端调用形状，但供应商地址和 Token 已全部迁入 Connect。
   * 这里只接受现有 search/baseInfo 两个能力，禁止把任意供应商路径变成通用代理。
   */
  async doRequest(options: IRequestOptions): Promise<any> {
    const target = connectorTarget(options);
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let status = 503;
    try {
      const response = await this.fetcher(`${this.host}${target.path}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({ keyword: target.keyword }),
      });
      status = response.status;
      const body = await response.json().catch(() => null) as (Record<string, any> & ConnectorErrorBody) | null;
      if (!response.ok) {
        throw new Error(body?.error?.message || `天眼查连接器请求失败（HTTP ${response.status}）`);
      }
      return body;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        status = 504;
        throw new Error("天眼查连接器响应超时");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      logger.info(`[provider-call] provider=tianyancha via=connector operation=${target.operation} status=${status} durationMs=${Date.now() - started}`);
    }
  }
}

function connectorTarget(options: IRequestOptions) {
  if (options.method !== "GET") throw new Error("天眼查连接器只支持只读查询");
  if (options.path === "/search/2.0") {
    return { path: "/v1/providers/tianyancha/company/search", keyword: String(options.query?.word ?? "").trim(), operation: "company.search" };
  }
  if (options.path === "/ic/baseinfoV3/2.0") {
    return { path: "/v1/providers/tianyancha/company/base-info", keyword: String(options.query?.keyword ?? "").trim(), operation: "company.base-info" };
  }
  throw new Error("不支持的天眼查连接器能力");
}
