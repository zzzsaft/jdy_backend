import axios from "axios";
import { logger } from "../../config/logger.js";
import {
  decryptJson,
  encryptJson,
  isWechatProxyEncryptedBody,
} from "./wechat_proxy_crypto.js";

export type WechatProxyTokenType = "corp" | "crm" | "none";

interface WechatProxyRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  tokenType: WechatProxyTokenType;
  query?: any;
  payload?: any;
}

interface ProxyUnavailableResult {
  ok: false;
  reason: "missing_secret" | "unavailable";
}

interface ProxySuccessResult<T> {
  ok: true;
  data: T;
}

type ProxyResult<T> = ProxyUnavailableResult | ProxySuccessResult<T>;

const CONNECTION_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "ENOTFOUND",
]);

const DEFAULT_PROXY_HOST = "http://122.226.146.110:780";
let unavailableUntil = 0;
let nextProbeAt = 0;
let missingSecretLogged = false;

const now = () => Date.now();

export const getWechatProxyHost = () =>
  process.env.WECHAT_PROXY_HOST ??
  process.env.JCTIMES_WECHAT_PROXY_HOST ??
  DEFAULT_PROXY_HOST;

const getProbeIntervalMs = () => {
  const configured = Number(process.env.WECHAT_PROXY_PROBE_INTERVAL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 60_000;
};

const getSecret = () => process.env.WECHAT_PROXY_CRYPTO_SECRET;

const isProxyConnectionError = (error: any) => {
  if (!axios.isAxiosError(error)) return false;
  if (error.response) return false;
  return !error.code || CONNECTION_ERROR_CODES.has(error.code);
};

const markProxyUnavailable = (error: any) => {
  const probeIntervalMs = getProbeIntervalMs();
  unavailableUntil = now() + probeIntervalMs;
  nextProbeAt = unavailableUntil;
  logger.error(
    `[wechat-proxy] jctimes unavailable, fallback to local WeChat API for ${probeIntervalMs}ms: ${
      error?.code ?? error?.message ?? String(error)
    }`
  );
};

const markProxyAvailable = () => {
  if (unavailableUntil > 0) {
    logger.info("[wechat-proxy] jctimes proxy recovered; routing via proxy");
  }
  unavailableUntil = 0;
  nextProbeAt = 0;
};

const ensureSecret = (): string | null => {
  const secret = getSecret();
  if (secret) return secret;
  if (!missingSecretLogged) {
    missingSecretLogged = true;
    logger.warn(
      "[wechat-proxy] WECHAT_PROXY_CRYPTO_SECRET is missing; fallback to local WeChat API"
    );
  }
  return null;
};

export const shouldBypassWechatProxy = () =>
  unavailableUntil > 0 && now() < nextProbeAt;

export const probeWechatProxy = async (): Promise<boolean> => {
  const secret = ensureSecret();
  if (!secret) return false;

  const pingPayload = {
    purpose: "wechat-proxy-health-check",
    ts: new Date().toISOString(),
  };

  try {
    const response = await axios.post(
      `${getWechatProxyHost()}/crypto/test`,
      { encrypted: encryptJson(pingPayload, secret) },
      {
        timeout: 5000,
        validateStatus: () => true,
        headers: { "Content-Type": "application/json" },
        proxy: false as false,
      }
    );
    if (response.status !== 200 || !isWechatProxyEncryptedBody(response.data)) {
      throw new Error(`unexpected probe response status=${response.status}`);
    }
    const decrypted = decryptJson<any>(response.data.encrypted, secret);
    const ok =
      decrypted?.ok === true &&
      JSON.stringify(decrypted.decrypted) === JSON.stringify(pingPayload);
    if (!ok) throw new Error("probe decrypted payload mismatch");
    markProxyAvailable();
    return true;
  } catch (error) {
    if (isProxyConnectionError(error)) {
      markProxyUnavailable(error);
      return false;
    }
    logger.error(
      `[wechat-proxy] health probe failed without connection error: ${
        error?.message ?? String(error)
      }`
    );
    nextProbeAt = now() + getProbeIntervalMs();
    unavailableUntil = nextProbeAt;
    return false;
  }
};

export const requestWechatProxy = async <T = any>(
  request: WechatProxyRequest
): Promise<ProxyResult<T>> => {
  const secret = ensureSecret();
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!request.path.startsWith("/cgi-bin/")) {
    throw new Error(
      `Wechat proxy path must start with /cgi-bin/: ${request.path}`
    );
  }

  if (shouldBypassWechatProxy()) {
    return { ok: false, reason: "unavailable" };
  }

  if (unavailableUntil > 0 && now() >= nextProbeAt) {
    const recovered = await probeWechatProxy();
    if (!recovered) return { ok: false, reason: "unavailable" };
  }

  const payload = {
    method: request.method,
    path: request.path,
    tokenType: request.tokenType,
    query: request.query ?? {},
    payload: request.payload ?? {},
  };

  try {
    const response = await axios.post(
      `${getWechatProxyHost()}/wechat/proxy`,
      { encrypted: encryptJson(payload, secret) },
      {
        timeout: 15000,
        validateStatus: () => true,
        headers: { "Content-Type": "application/json" },
        proxy: false as false,
      }
    );

    if (!isWechatProxyEncryptedBody(response.data)) {
      throw new Error(
        `Invalid encrypted response from WeChat proxy, status: ${response.status}, path: ${payload.path}`
      );
    }

    const data = decryptJson<T>(response.data.encrypted, secret);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(
        `Invalid WeChat proxy JSON response, status: ${response.status}, path: ${payload.path}`
      );
    }
    if (response.status && response.status > 200) {
      throw new Error(
        `请求错误！Status: ${response.status}, path: ${payload.path}`
      );
    }
    markProxyAvailable();
    return { ok: true, data };
  } catch (error) {
    if (isProxyConnectionError(error)) {
      markProxyUnavailable(error);
      return { ok: false, reason: "unavailable" };
    }
    throw error;
  }
};
