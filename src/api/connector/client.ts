/** Internal Connect transport. Never retry writes or expose provider bodies in errors. */
export function connectorConfig() {
  const baseURL = (process.env.CONNECTOR_BASE_URL?.trim() || "http://integration-connector:4180").replace(/\/$/, "");
  const token = process.env.CONNECTOR_JDY_BACKEND_TOKEN?.trim();
  if (!token) throw new Error("CONNECTOR_JDY_BACKEND_TOKEN is not configured");
  const url = new URL(baseURL);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid CONNECTOR_BASE_URL");
  return { baseURL, token };
}
export async function connectorResponse(path: string, init: RequestInit = {}, timeoutMs = 110000): Promise<Response> {
  if (!path.startsWith("/v1/") || path.includes("..") || path.includes("\\")) throw new Error("Invalid Connect path");
  const { baseURL, token } = connectorConfig();
  try {
    const response = await fetch(baseURL + path, {
      ...init, headers: { "Content-Type": "application/json", ...init.headers, Authorization: `Bearer ${token}` },
      redirect: "error", signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Connect request failed (HTTP ${response.status})`);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Connect request failed")) throw error;
    throw new Error("Connect request failed or timed out");
  }
}
export async function connectorJSON(path: string, body?: unknown, method = "POST"): Promise<any> {
  const response = await connectorResponse(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try { return await response.json(); } catch { throw new Error("Invalid Connect JSON response"); }
}
