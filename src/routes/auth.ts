import { Request, Response } from "express";
import {
  AuthServiceError,
  authService,
} from "../services/authService.js";
import { locationService } from "../services/locationService.js";
import { logger } from "../config/logger.js";
import { clearAuthCookie, setAuthCookie } from "../middleware/browserAuth.js";

const LEGACY_CLIENT_ID = "legacy-frontend";
const authAttempts = new Map<string, { count: number; resetAt: number }>();

const enforceAuthRateLimit = (request: Request, response: Response): boolean => {
  const now = Date.now();
  const key = `${request.ip}:${request.path}`;
  const current = authAttempts.get(key);
  if (!current || current.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  if (current.count <= 20) return true;
  response.status(429).json({ error: "RATE_LIMITED" });
  return false;
};

const requireAllowedOrigin = (
  request: Request,
  response: Response,
  clientId: string
): boolean => {
  const origin = request.headers.origin;
  if (!origin) return true;
  let client;
  try {
    client = authService.getWechatClient(clientId);
  } catch (error) {
    sendAuthError(response, error);
    return false;
  }
  if (
    client.allowedOrigins.length === 0 ||
    client.allowedOrigins.includes(origin)
  ) {
    return true;
  }
  response.status(403).json({ error: "ORIGIN_NOT_ALLOWED" });
  return false;
};

const sendAuthError = (response: Response, error: unknown) => {
  if (error instanceof AuthServiceError) {
    response.status(error.status).json({ error: error.code });
    return;
  }
  logger.error("WeCom authentication failed");
  response.status(500).json({ error: "AUTHENTICATION_FAILED" });
};

const setLocation = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  const position = request.body.location;
  if (!userid || !position) return response.status(400).send("获取失败");
  await locationService.addLocation(
    userid,
    new Date(),
    position.latitude,
    position.longitude,
    "frontend"
  );
  response.send({});
};

const jdySSo = async (request: Request, response: Response) => {
  const token = request.query.request;
  const code = request.query.code;
  const redirect_uri = request.query.redirect_uri;
  const state = request.query.state;
  const url = await authService.jdyVerifyToken(
    token,
    code,
    redirect_uri,
    state
  );
  response.redirect(url);
};

const jdySSObyFrontend = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request)).userId;
  const redirect_uri = request.query.redirect_uri;
  const link = authService.jdySSO(
    userid,
    `https://www.jiandaoyun.com${redirect_uri}`
  );
  response.send({ link });
};

const jdySSObyWechat = async (request: Request, response: Response) => {
  // 基础重定向URL
  let redirect_url = "http://hz.jc-times.com:2000/auth/sso/jdy";

  // 如果有query参数，附加到redirect_url
  if (Object.keys(request.query).length > 0) {
    // 创建URLSearchParams对象处理query参数
    const queryParams = new URLSearchParams();

    // 将request.query的所有参数添加到URLSearchParams
    for (const [key, value] of Object.entries(request.query)) {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    }

    // 将query参数附加到redirect_url
    redirect_url +=
      (redirect_url.includes("?") ? "&" : "?") + queryParams.toString();
  }

  // 对完整的redirect_url进行编码
  const encodedRedirectUrl = encodeURIComponent(redirect_url);

  // 构建微信OAuth2.0授权URL
  const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=${encodedRedirectUrl}&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect`;

  // 重定向到微信授权页面
  response.redirect(authUrl);
};

const jdySSoRedirect = async (request: Request, response: Response) => {
  const { redirect_uri } = request.query;
  // console.log(redirect_uri);
  if (!redirect_uri) {
    response.status(400).send("参数错误");
    return;
  }
  const redirectUrl = `https://www.jiandaoyun.com${redirect_uri}`;
  if (!redirectUrl) return response.status(400).send("获取重定向地址失败");
  return response.redirect(redirectUrl);
};

const fbtSSo = async (request: Request, response: Response) => {
  const code = request.query.code;
  if (!code) {
    response.status(400).send("参数错误");
    return;
  }
  const redirectUrl = await authService.fbtSSO(code);
  if (!redirectUrl) return response.status(400).send("获取重定向地址失败");
  return response.redirect(redirectUrl);
};

const corpTicket = async (request: Request, response: Response) => {
  const { timestamp, nonce, url } = request.body;
  const signature = await authService.corpSignature(timestamp, nonce, url);
  response.send(signature);
};

const agentTicket = async (request: Request, response: Response) => {
  const { timestamp, nonce, url } = request.body;
  const signature = await authService.agentSignature(timestamp, nonce, url);
  response.send(signature);
};

const token = async (request: Request, response: Response) => {
  const { code } = request.body;
  if (!code) {
    response.status(400).send("参数错误");
    return;
  }
  if (!enforceAuthRateLimit(request, response)) return;
  if (!requireAllowedOrigin(request, response, LEGACY_CLIENT_ID)) return;
  response.setHeader("Deprecation", "true");
  response.setHeader("Sunset", "Wed, 31 Dec 2026 23:59:59 GMT");
  logger.warn("Deprecated /auth/token endpoint used");
  try {
    const result = await authService.exchangeWechatCode(LEGACY_CLIENT_ID, code);
    setAuthCookie(response, result.token);
    response.send(result);
  } catch (error) {
    sendAuthError(response, error);
  }
};

export const wecomToken = async (request: Request, response: Response) => {
  const clientId = String(request.body?.clientId ?? "").trim();
  const code = String(request.body?.code ?? "").trim();
  if (!clientId) {
    response.status(400).json({ error: "INVALID_CLIENT" });
    return;
  }
  if (!enforceAuthRateLimit(request, response)) return;
  if (!requireAllowedOrigin(request, response, clientId)) return;
  try {
    const result = await authService.exchangeWechatCode(clientId, code);
    setAuthCookie(response, result.token);
    response.send(result);
  } catch (error) {
    sendAuthError(response, error);
  }
};

export const authMe = async (request: Request, response: Response) => {
  let user;
  const { location } = request.query;
  try {
    user = await authService.verifyToken(request);
  } catch (err) {
    // console.log("Token verification failed:", err);
    response.status(401).send("Unauthorized");
    return;
  }
  if (!user.userId) {
    response.status(401).send("Unauthorized");
    return;
  }
  response.setHeader("Cache-Control", "no-store");
  response.send({
    userId: user.userId,
    corpId: user.corpId,
    clientId: user.clientId,
    scopes: user.scopes,
    name: user.name,
    avatar: user.avatar,
  });
};

export const logout = async (_request: Request, response: Response) => {
  clearAuthCookie(response);
  response.status(204).send();
};

export const AuthRoutes = [
  {
    path: "/auth/wecom/token",
    method: "post",
    action: wecomToken,
  },
  {
    path: "/auth/corp_ticket",
    method: "post",
    action: corpTicket,
  },
  {
    path: "/auth/agent_ticket",
    method: "post",
    action: agentTicket,
  },
  {
    path: "/auth/token",
    method: "post",
    action: token,
  },
  {
    path: "/auth/me",
    method: "get",
    action: authMe,
  },
  {
    path: "/auth/logout",
    method: "post",
    action: logout,
  },
  {
    path: "/auth/sso/fbt",
    method: "get",
    action: fbtSSo,
  },
  {
    path: "/auth/sso/jdy",
    method: "get",
    action: jdySSo,
  },
  {
    path: "/auth/sso/jdy/wechat",
    method: "get",
    action: jdySSObyWechat,
  },
  {
    path: "/auth/sso/jdy/redirect",
    method: "get",
    action: jdySSObyFrontend,
  },
  {
    path: "/auth/location",
    method: "post",
    action: setLocation,
  },
];
