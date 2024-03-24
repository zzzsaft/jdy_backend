import { JdyRoutes } from "./frontend/JdyRoutes";
import { TriggerRoutes } from "./frontend/TriggerRoutes";
import { JdyCustomRoutes } from "./jdy/JdyCustomRoutes";
import { JdyDataRoutes } from "./jdy/JdyDataRoutes";
/**
 * All application routes.
 */
export const AppRoutes = [
    ...TriggerRoutes,
    ...JdyRoutes,
    ...JdyDataRoutes,
    ...JdyCustomRoutes,
];
//# sourceMappingURL=index.js.map