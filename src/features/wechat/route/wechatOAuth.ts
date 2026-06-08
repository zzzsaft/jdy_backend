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
