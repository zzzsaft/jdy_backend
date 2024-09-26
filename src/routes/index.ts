import { JdyRoutes } from "./frontend/JdyRoutes";
import { TriggerRoutes } from "./frontend/TriggerRoutes";
import { JdyDataRoutes } from "./jdy";
import { parkingRoutes } from "./parking";
import { UtilsRoutes } from "./utils";
import { WechatOAuthRoutes } from "./wechat/wechatOAuth";
import { WechatRoutes } from "./wechat/wechat";
import { xftRoute } from "./xft";

/**
 * All application routes.
 */
export const AppRoutes = [
  ...TriggerRoutes,
  ...JdyRoutes,
  ...WechatRoutes,
  ...WechatOAuthRoutes,
  ...xftRoute,
  ...UtilsRoutes,
  ...JdyDataRoutes,
  ...parkingRoutes,
];
