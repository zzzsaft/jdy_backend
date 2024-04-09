import { JdyRoutes } from "./frontend/JdyRoutes";
import { TriggerRoutes } from "./frontend/TriggerRoutes";
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
//# sourceMappingURL=index.js.map