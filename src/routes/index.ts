import { JdyDataRoutes } from "./jdy.js";
import { UtilsRoutes } from "./utils.js";
import { AuthRoutes } from "./auth.js";
import { FeatureRoutes } from "../features/index.js";

/**
 * All application routes.
 */
export const AppRoutes = [
  ...UtilsRoutes,
  ...JdyDataRoutes,
  ...AuthRoutes,
  ...FeatureRoutes,
];
