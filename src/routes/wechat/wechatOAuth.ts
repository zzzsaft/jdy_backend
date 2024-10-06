import { jdyRedirect } from "../../controllers/jdy/redirect.jdy.controller";
import { Request, Response } from "express";
import {
  wechatWebHook,
  wechatWebHookCheck,
} from "../../controllers/wechat/wechat.controller";
import { xftSSOLogin } from "../../controllers/xft/login.xft.controller";
import { wechatUserApiClient } from "../../utils/wechat/user";
import { fbtUserApiClient } from "../../utils/fenbeitong/user";
import { User } from "../../entity/wechat/User";

const fbtSSOLogin = async (request: Request, response: Response) => {
  const code = request.query.code;
  if (typeof code !== "string") {
    return "no code";
  }
  const userid = (await wechatUserApiClient.getUserInfo(code))["userid"];
  const user = await User.findOne({
    where: { user_id: userid },
    select: ["fbtPhone"],
  });
  const redirectUrl =
    (await fbtUserApiClient.getSSOLink(user?.fbtPhone ?? "", "home")) ?? "/";
  response.redirect(redirectUrl);
};

export const WechatOAuthRoutes = [
  {
    path: "/xft/sso",
    method: "get",
    action: xftSSOLogin,
  },
  {
    path: "/fbt/sso",
    method: "get",
    action: fbtSSOLogin,
  },
  {
    path: "/jdy/redirect",
    method: "get",
    action: jdyRedirect,
  },
];
// https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=http%3A%2F%2Ftz.jc-times.com%3A2000%2Fwechat%2Fsso&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect
