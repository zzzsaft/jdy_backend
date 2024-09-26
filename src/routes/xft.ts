import { JdyWebhook } from "../controllers/jdy/data.jdy.controller";
import { xftEvent } from "../controllers/xft/event.xft.controller";
import { xftTodo } from "../controllers/xft/todo.xft.controller";
import { token } from "../utils/wechat/token";

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
];
