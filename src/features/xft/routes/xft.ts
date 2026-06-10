import { xftEvent } from "../controller/event.xft.controller.js";
import { xftTodo } from "../controller/todo.xft.controller.js";
import { testXftSSOLogin } from "../controller/login.xft.controller.js";
import { token } from "../../wechat/api/token.js";

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
