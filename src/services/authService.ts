import { jctimesApiClient } from "../api/jctimes/app.js";
import crypto from "crypto";
import {
  extractToken,
  generateJdyToken,
  generateToken,
  verifyJdyToken,
  verifyToken,
} from "../utils/jwt.js";
import { User } from "../entity/basic/employee.js";
import { employeeService } from "./md/employeeService.js";
import { fbtUserApiClient } from "../features/fbt/api/user.js";
import { wechatUserApiClient } from "../features/wechat/api/user.js";
import {
  getWechatAuthClient,
  type WechatAuthClientConfig,
} from "../features/wechat/wechatCorps.js";
import { contactApiClient } from "../features/wechat/api/contact.js";
import { logger } from "../config/logger.js";

type WechatExchangeResult = {
  token: string;
  user: {
    userId: string;
    corpId: string;
    clientId: string;
    name: string | null;
    avatar: string | null;
  };
};

const wechatExchangeCache = new Map<
  string,
  { expiresAt: number; result: WechatExchangeResult }
>();
const pendingWechatExchanges = new Map<string, Promise<WechatExchangeResult>>();

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
  }
}

class AuthService {
  constructor() {}
  corpSignature = async (timestamp: string, nonce: string, url: string) => {
    const ticket = await jctimesApiClient.getCorpTicket();
    const jsapi_ticket = `jsapi_ticket=${ticket}&noncestr=${nonce}&timestamp=${timestamp}&url=${url}`;
    return this.sha1(jsapi_ticket);
  };
  agentSignature = async (timestamp: string, nonce: string, url: string) => {
    const ticket = await jctimesApiClient.getAgentTicket();
    const jsapi_ticket = `jsapi_ticket=${ticket}&noncestr=${nonce}&timestamp=${timestamp}&url=${url}`;
    return this.sha1(jsapi_ticket);
  };
  sha1 = (input) => crypto.createHash("sha1").update(input).digest("hex");

  generateToken = async (code) => {
    let userid;
    if (code === "LiangZhi") userid = "LiangZhi";
    else userid = await this.getUseridbyCode(code, "crm");
    if (!userid) return null;
    const user = await employeeService.getEmployeeToWeb(userid);
    const token = generateToken({
      userId: userid,
      name: user?.name,
      avatar: user?.avatar,
    });
    return token;
  };

  getWechatClient = (clientId: string): WechatAuthClientConfig => {
    try {
      return getWechatAuthClient(clientId);
    } catch {
      throw new AuthServiceError(
        "Invalid authentication client",
        400,
        "INVALID_CLIENT"
      );
    }
  };

  private exchangeWechatCodeOnce = async (
    clientId: string,
    code: string
  ) => {
    const client = this.getWechatClient(clientId);
    if (!code) {
      throw new AuthServiceError("Missing authorization code", 400, "MISSING_CODE");
    }
    let identity;
    try {
      identity = await wechatUserApiClient.getUserInfo(code, {
        corpId: client.corpId,
        agentId: client.agentId,
        appName: client.appName,
      });
    } catch {
      throw new AuthServiceError(
        "WeCom authentication service unavailable",
        502,
        "WECOM_UNAVAILABLE"
      );
    }

    const userId = identity?.userid;
    if (identity?.errcode !== 0 || !userId) {
      logger.warn(
        `WeCom code exchange rejected clientId=${client.clientId} corpId=${client.corpId} agentId=${client.agentId} errcode=${identity?.errcode ?? "missing"}`
      );
      throw new AuthServiceError(
        "Invalid WeCom authorization code",
        401,
        "INVALID_CODE"
      );
    }

    let user = await User.findOne({
      where: { corp_id: client.corpId, user_id: userId },
    });
    if (!user) {
      let profile: any = null;
      try {
        const result = await contactApiClient.getUser(
          userId,
          client.corpId,
          client.appName
        );
        if (result?.errcode === 0) profile = result;
      } catch {
        // The application may authenticate users without contact permissions.
      }
      await User.upsert(
        {
          corp_id: client.corpId,
          user_id: userId,
          corp_name: client.corpName,
          is_employed: true,
          name: profile?.name,
          avatar: profile?.avatar,
          thumb_avatar: profile?.thumb_avatar,
          mobile: profile?.mobile,
          department_id: profile?.department,
          main_department_id: profile?.main_department
            ? String(profile.main_department)
            : undefined,
        },
        ["corp_id", "user_id"]
      );
      user = await User.findOneOrFail({
        where: { corp_id: client.corpId, user_id: userId },
      });
    }

    const token = generateToken({
      userId,
      corpId: client.corpId,
      clientId: client.clientId,
      scopes: client.scopes,
      name: user.name ?? null,
      avatar: user.avatar ?? null,
    });
    return {
      token,
      user: {
        userId,
        corpId: client.corpId,
        clientId: client.clientId,
        name: user.name ?? null,
        avatar: user.avatar ?? null,
      },
    };
  };

  exchangeWechatCode = async (
    clientId: string,
    code: string
  ): Promise<WechatExchangeResult> => {
    if (!code) {
      throw new AuthServiceError("Missing authorization code", 400, "MISSING_CODE");
    }
    const cacheKey = crypto
      .createHash("sha256")
      .update(`${clientId}:${code}`)
      .digest("hex");
    const now = Date.now();
    const cached = wechatExchangeCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.result;
    wechatExchangeCache.delete(cacheKey);

    const pending = pendingWechatExchanges.get(cacheKey);
    if (pending) return pending;

    const exchange = this.exchangeWechatCodeOnce(clientId, code)
      .then((result) => {
        wechatExchangeCache.set(cacheKey, {
          expiresAt: Date.now() + 60_000,
          result,
        });
        return result;
      })
      .finally(() => pendingWechatExchanges.delete(cacheKey));
    pendingWechatExchanges.set(cacheKey, exchange);
    return exchange;
  };

  verifyToken = async (req, expectedClientIds?: readonly string[]) => {
    try {
      const token = extractToken(req);
      if (!token) return { userId: "" };
      const decoded = verifyToken(token, expectedClientIds);
      return decoded;
    } catch (err) {
      // console.error("Token verification failed:", err);
      return { userId: "" };
    }
  };

  async jdyVerifyToken(req, code, redirect, state) {
    const verify = verifyJdyToken(req);
    if (!verify) {
      return "Unauthorized";
    }
    const userid = await this.getUseridbyCode(code);
    return this.jdySSO(userid, `https://www.jiandaoyun.com${redirect}`, state);
  }

  jdySSO = (userid, url, state = "") => {
    if (!userid) return "";
    const acs = process.env.JDYSSO_ACS;
    const responseToken = generateJdyToken(userid, url as string);
    let responseQuery = new URLSearchParams({
      response: responseToken,
    }).toString();
    if (state) {
      responseQuery = new URLSearchParams({
        response: responseToken,
        // state,
      }).toString();
    }
    return `${acs}?${responseQuery}`;
  };

  fbtSSO = async (code) => {
    const userid = await this.getUseridbyCode(code);
    if (!userid) {
      return null;
    }
    const user = await User.findOne({
      where: { user_id: userid },
      select: ["fbtThirdId", "mobile", "name"],
    });
    if (!user?.fbtThirdId && user?.mobile) {
      return null;
    }
    const redirectUrl =
      (await fbtUserApiClient.getSSOLink(
        user?.fbtThirdId ?? user?.mobile,
        "home"
      )) ?? "/";
    if (!redirectUrl) {
      console.log(user?.name, "分贝通登录失败");
    }
    return redirectUrl;
  };

  getUseridbyCode = async (code, tokenType: "hr" | "crm" = "hr") => {
    if (typeof code !== "string" || !code) {
      return null;
    }
    const payload = await wechatUserApiClient.getUserInfo(code, tokenType);
    if (payload?.["userid"]) {
      return payload["userid"];
    } else return null;
  };
}

export const authService = new AuthService();
