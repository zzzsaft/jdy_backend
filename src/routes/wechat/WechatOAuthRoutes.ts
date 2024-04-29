import { jdyRedirect } from "../../controllers/jdy/redirect.jdy.controller";
import {
  wechatWebHook,
  wechatWebHookCheck,
} from "../../controllers/wechat/wechat.controller";
import { xftSSOLogin } from "../../controllers/xft/login.xft.controller";

export const WechatOAuthRoutes = [
  {
    path: "/wechat/sso",
    method: "get",
    action: xftSSOLogin,
  },
  {
    path: "/jdy/redirect",
    method: "get",
    action: jdyRedirect,
  },
];
// https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=http%3A%2F%2Ftz.jc-times.com%3A2000%2Fwechat%2Fsso&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect
