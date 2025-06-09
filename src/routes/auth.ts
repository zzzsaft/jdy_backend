import { Request, Response } from "express";
import { authService } from "../services/authService";
import { locationService } from "../services/locationService";

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
  const token = await authService.generateToken(code);
  if (!token) {
    console.log(`auth.ts token${token}`);
    return response.status(400).send("获取token失败");
  }
  // console.log(token);
  response.send({ token });
};

const verify = async (request: Request, response: Response) => {
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
  response.send(user);
};

export const AuthRoutes = [
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
    action: verify,
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
