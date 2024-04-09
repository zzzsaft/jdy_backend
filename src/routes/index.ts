import { JdyRoutes } from "./frontend/JdyRoutes";
import { TriggerRoutes } from "./frontend/TriggerRoutes";
import { JdyCustomRoutes } from "./jdy/JdyCustomRoutes";
import { JdyDataRoutes } from "./jdy/JdyDataRoutes";
import { WechatRoutes } from "./WechatRoutes";

/**
 * All application routes.
 */
export const AppRoutes = [
  ...TriggerRoutes,
  ...JdyRoutes,
  ...WechatRoutes,
  // ...JdyDataRoutes,
  // ...JdyCustomRoutes,
];
