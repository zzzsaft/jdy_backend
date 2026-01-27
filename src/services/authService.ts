import { jctimesApiClient } from "../api/jctimes/app";
import { agentTicket, corpTicket } from "../api/wechat/ticket";
import crypto from "crypto";
import {
  extractToken,
  generateJdyToken,
  generateToken,
  verifyJdyToken,
  verifyToken,
} from "../utils/jwt";
import { wechatUserApiClient } from "../api/wechat/user";
import nodeRSA from "node-rsa";
import qs from "querystring";
import { User } from "../entity/basic/employee";
import { employeeService } from "./md/employeeService";
import { fbtUserApiClient } from "../features/fbt/api/user";
const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;
const key = new nodeRSA(`-----BEGIN RSA PRIVATE KEY-----
    ${RSA_PRIVATE_KEY}
    -----END RSA PRIVATE KEY-----`);

// 导出公钥
const publicKey = key.exportKey("public");

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

  verifyToken = async (req) => {
    try {
      const token = extractToken(req);
      if (!token) return { userId: "" };
      const decoded = verifyToken(token);
      const newtoken = generateToken({
        userId: decoded.userId,
        name: decoded?.name,
        avatar: decoded?.avatar,
      });
      return { ...decoded, token: newtoken };
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

function encrypt(plaintext: Buffer): string {
  return crypto
    .publicEncrypt(
      {
        key: Buffer.from(publicKey),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      plaintext
    )
    .toString("base64");
}
