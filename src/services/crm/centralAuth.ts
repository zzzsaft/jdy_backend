import type { Request, Response } from "express";
import { getWechatAuthClient } from "../../features/wechat/wechatCorps.js";

export const crmCentralAuthEnabled = () => process.env.CRM_SSO_ENABLED === "true";
const config = () => {
  const publicURL = (process.env.CRM_SSO_ISSUER || "https://hz.jc-times.com:2026").replace(/\/$/, "");
  const baseURL = (process.env.CRM_SSO_INTERNAL_URL || publicURL).replace(/\/$/, "");
  const secret = process.env.CRM_SSO_MODULE_SECRET;
  const corpId = process.env.CRM_SSO_CORP_ID;
  if (!secret || !corpId) throw new Error("CRM SSO is not configured");
  return { publicURL, baseURL, secret, corpId, module: "crm", audience: "jdy-crm" };
};

async function centralJSON(path: string, init: RequestInit) {
  const response = await fetch(config().baseURL + path, { ...init, redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error("Unified authentication rejected request"); }
  return response.json();
}

export async function verifyCRMToken(token: string) {
  const cfg = config();
  const user = await centralJSON("/api/v1/userinfo", { headers: { Authorization: `Bearer ${token}` } });
  if (user.iss !== cfg.publicURL || user.aud !== cfg.audience || user.clientId !== cfg.module || user.corpId !== cfg.corpId ||
      typeof user.wecomUserId !== "string" || !user.wecomUserId || !Array.isArray(user.scopes) || !user.scopes.includes("module:access")) {
    throw new Error("CRM identity scope mismatch");
  }
  const client = getWechatAuthClient("legacy-frontend");
  if (client.corpId !== user.corpId) throw new Error("CRM corporation mismatch");
  return { ...user, userId: user.wecomUserId, sub: user.wecomUserId, clientId: "legacy-frontend", scopes: client.scopes };
}

export async function exchangeCRMTicket(request: Request, response: Response) {
  response.setHeader("Cache-Control", "no-store");
  if (!crmCentralAuthEnabled()) { response.status(503).json({ error: "CRM_SSO_NOT_ENABLED" }); return; }
  const ticket = request.body?.ticket;
  if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(ticket)) { response.status(400).json({ error: "INVALID_TICKET" }); return; }
  try {
    const cfg = config();
    const result = await centralJSON("/api/v1/token/exchange", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${cfg.module}:${cfg.secret}`).toString("base64")}` },
      body: JSON.stringify({ ticket }),
    });
    if (typeof result.access_token !== "string") throw new Error("Missing token");
    const user = await verifyCRMToken(result.access_token);
    response.json({ token: result.access_token, user });
  } catch { response.status(401).json({ error: "CRM_AUTHENTICATION_FAILED" }); }
}
