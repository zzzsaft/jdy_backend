import { JdyWebhook } from "../controllers/jdy/data.jdy.controller";
import { xftEvent } from "../controllers/xft/event.xft.controller";
import { xftTodo } from "../controllers/xft/todo.xft.controller";
import { token } from "../api/wechat/token";
import { testXftSSOLogin } from "../controllers/xft/login.xft.controller";

export const xftRoute = [
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
  {
    path: "/xft/event",
    method: "post",
    action: xftEvent,
  },
  {
    path: "/xft/test",
    method: "post",
    action: testXftSSOLogin,
  },
];
