import { JdyRoutes } from "./frontend/jdyroutes.js";
import { TriggerRoutes } from "./frontend/triggerroutes.js";
import { JdyDataRoutes } from "./jdy.js";
import { UtilsRoutes } from "./utils.js";
import { AuthRoutes } from "./auth.js";
import { FeatureRoutes } from "../features/index.js";

/**
 * All application routes.
 */
export const AppRoutes = [
  ...TriggerRoutes,
  ...JdyRoutes,
  ...UtilsRoutes,
  ...JdyDataRoutes,
  ...AuthRoutes,
  ...FeatureRoutes,
];
