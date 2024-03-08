import { JdyRoutes } from "./frontend/JdyRoutes";
import { TriggerRoutes } from "./frontend/TriggerRoutes";

/**
 * All application routes.
 */
export const AppRoutes = [...TriggerRoutes, ...JdyRoutes];
