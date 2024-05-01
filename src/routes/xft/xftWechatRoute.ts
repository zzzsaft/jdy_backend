import { JdyWebhook } from "../../controllers/jdy/data.jdy.controller";
import { xftTodo } from "../../controllers/xft/todo.xft.controller";
import { token } from "../../utils/wechat/token";

export const XftWechatRoute = [
  {
    path: "/xft/wechat_accessToken",
    method: "post",
    action: () => token.get_token(),
  },
  {
    path: "/xft/todo",
    method: "post",
    action: xftTodo,
  },
];
