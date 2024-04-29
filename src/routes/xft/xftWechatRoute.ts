import { JdyWebhook } from "../../controllers/jdy/data.jdy.controller";
import { token } from "../../utils/wechat/token";

export const JdyDataRoutes = [
  {
    path: "/xft/wechat_accessToken",
    method: "post",
    action: () => token.get_token(),
  },
];
