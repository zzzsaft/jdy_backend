import { jdyRedirect } from "../../../controllers/jdy/redirect.jdy.controller";
import { Request, Response } from "express";
import {
  wechatWebHook,
  wechatWebHookCheck,
} from "../controller/wechat.controller";
import { xftSSOLogin } from "../../xft/controller/login.xft.controller";
import { User } from "../../../entity/basic/employee";
import { jdySsoRequest } from "../../../controllers/jdy/jdySso";

export const WechatOAuthRoutes = [
  {
    path: "/xft/sso",
    method: "get",
    action: xftSSOLogin,
  },
  {
    path: "/jdy/sso",
    method: "get",
    action: jdySsoRequest,
  },
  {
    path: "/jdy/redirect",
    method: "get",
    action: jdyRedirect,
  },
];
// https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=http%3A%2F%2Ftz.jc-times.com%3A2000%2Fwechat%2Fsso&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect
