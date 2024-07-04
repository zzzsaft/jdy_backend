import { JdyRoutes } from "./frontend/JdyRoutes";
import { TriggerRoutes } from "./frontend/TriggerRoutes";
import { JdyCustomRoutes } from "./jdy/JdyCustomRoutes";
import { JdyDataRoutes } from "./jdy/JdyDataRoutes";
import { parkingRoute } from "./parking";
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
  parkingRoute,
  // ...JdyDataRoutes,
  // ...JdyCustomRoutes,
];
