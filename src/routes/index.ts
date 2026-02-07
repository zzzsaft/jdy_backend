import { JdyRoutes } from "./frontend/JdyRoutes";
import { TriggerRoutes } from "./frontend/TriggerRoutes";
import { JdyDataRoutes } from "./jdy";
import { UtilsRoutes } from "./utils";
import { AuthRoutes } from "./auth";
import { FeatureRoutes } from "../features";

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
