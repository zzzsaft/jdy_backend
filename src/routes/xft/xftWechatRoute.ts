import { JdyWebhook } from "../../controllers/jdy/data.jdy.controller";

export const JdyDataRoutes = [
  {
    path: "/xft/wechat_accessToken",
    method: "post",
    action: JdyWebhook,
  },
];
