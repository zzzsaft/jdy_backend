import { connectorResponse } from "../../../api/connector/client.js";

export const xftSSOApiClient = {
  async getSSOLink(userId: string, options: { todoId?: string; pageId?: string } = {}): Promise<string> {
    const response = await connectorResponse("/v1/providers/xft/sso-link", {
      method: "POST", body: JSON.stringify({ userId, ...options }),
    }, 10000);
    let result: any;
    try { result = await response.json(); } catch { throw new Error("Invalid XFT SSO response"); }
    // Only accept the fixed provider login origin/path, never an arbitrary redirect.
    let url: URL;
    try { url = new URL(result.url); } catch { throw new Error("Invalid XFT SSO response"); }
    if (url.origin !== "https://xft.cmbchina.com" || url.username || url.password || url.hash ||
        !/^\/xft-gateway\/xft-login-new\/xwapi\/login\/\d+_\d+$/.test(url.pathname) || !url.searchParams.get("secret")) {
      throw new Error("Invalid XFT SSO redirect");
    }
    return url.href;
  },
};
