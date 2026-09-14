import { IRequestOptions } from "../../../type/IType.js";
import { connectorResponse } from "../../../api/connector/client.js";

export class ApiClient {
  protected async doRequest(options: IRequestOptions, _host?: string) {
    if (!options.path.startsWith("/api/") && options.path !== "/gateway/rivers/api/oss/getPolicy") throw new Error("Unsupported BestSign Connect operation");
    const query = new URLSearchParams();
    for (const [key,value] of Object.entries(options.query ?? {})) if (value != null) query.set(key,String(value));
    const suffix = query.size ? `?${query}` : "";
    const target = options.path === "/gateway/rivers/api/oss/getPolicy" ? "/v1/providers/bestsign/oss-policy" : `/v1/providers/bestsign${options.path}${suffix}`;
    const response = await connectorResponse(target, {
      method: options.method,
      ...(options.method === "GET" ? {} : { body: JSON.stringify(options.payload ?? {}) }),
    });
    return this.handleResponse({ headers: { "content-type": response.headers.get("content-type") }, data: Buffer.from(await response.arrayBuffer()) });
  }
  private async handleResponse(res) {
    // zip或pdf格式
    const _contentType = res.headers["content-type"];
    if (
      _contentType &&
      (_contentType.includes("application/octet-stream") ||
        _contentType.includes("application/pdf") ||
        _contentType.includes("application/zip"))
    ) {
      const result = {
        contentType: res.headers["content-type"],
        content: Buffer.from(res.data).toString("base64"),
      };
      return result;
    } else {
      const asString = Buffer.from(res.data).toString("utf8");
      try {
        // BestSign may return 19-digit IDs (contractId/receiverId/...) that exceed JS MAX_SAFE_INTEGER.
        // If we JSON.parse directly, they will be rounded and we will persist wrong IDs.
        const safeJsonText = this.quoteLargeIntegers(asString);
        return JSON.parse(safeJsonText);
      } catch {
        return asString;
      }
    }
  }

  /**
   * JSON.parse cannot safely represent integers > Number.MAX_SAFE_INTEGER.
   * This helper turns long integer literals into strings before parsing, preserving exact IDs.
   */
  private quoteLargeIntegers(jsonText: string) {
    // Object values:  "key": 1234567890123456789
    let out = jsonText.replace(
      /(:\s*)(-?\d{16,})(\s*[,\}])/g,
      '$1"$2"$3'
    );
    // Array values: [1234567890123456789, ...]
    out = out.replace(
      /([\[,]\s*)(-?\d{16,})(\s*[,\]])/g,
      '$1"$2"$3'
    );
    return out;
  }
}
