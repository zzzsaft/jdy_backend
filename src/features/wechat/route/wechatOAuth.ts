import { jdyRedirect } from "../../../controllers/jdy/redirect.jdy.controller.js";
import { Request, Response } from "express";
import {
  wechatWebHook,
  wechatWebHookCheck,
} from "../controller/wechat.controller.js";
import { xftSSOLogin } from "../../xft/controller/login.xft.controller.js";
import { User } from "../../../entity/basic/employee.js";
import { jdySsoRequest } from "../../../controllers/jdy/jdySso.js";

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
