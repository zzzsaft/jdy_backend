import { JdyRoutes } from "./frontend/JdyRoutes";
import { TriggerRoutes } from "./frontend/TriggerRoutes";
import { JdyDataRoutes } from "./jdyRoutes";
import { parkingRoute } from "./parking";
import { UtilsRoutes } from "./utils";
import { WechatOAuthRoutes } from "./wechat/WechatOAuthRoutes";
import { WechatRoutes } from "./wechat/WechatRoutes";
import { XftWechatRoute } from "./xft/xftWechatRoute";

/**
 * All application routes.
 */
export const AppRoutes = [
  ...TriggerRoutes,
  ...JdyRoutes,
  ...WechatRoutes,
  ...WechatOAuthRoutes,
  ...XftWechatRoute,
  ...UtilsRoutes,
  ...JdyDataRoutes,
  parkingRoute,
];
