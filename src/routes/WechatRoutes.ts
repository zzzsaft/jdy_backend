import {
  wechatWebHook,
  wechatWebHookCheck,
} from "../controllers/wechat/wechat.controller";

export const WechatRoutes = [
  {
    path: "/wechat",
    method: "post",
    action: wechatWebHook,
  },
  {
    path: "/wechat",
    method: "get",
    action: wechatWebHookCheck,
  },
];
