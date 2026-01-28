import { JdyWebhook } from "../controllers/jdy/data.jdy.controller";
import { xftEvent } from "../controllers/xft/event.xft.controller";
import { xftTodo } from "../controllers/xft/todo.xft.controller";
import { testXftSSOLogin } from "../controllers/xft/login.xft.controller";
import { token } from "../features/wechat/api/token";

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
