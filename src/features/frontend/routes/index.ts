import { FrontendJdyRoutes } from "./jdy.routes.js";
import { FrontendTriggerRoutes } from "./trigger.routes.js";
import { UserPreferenceRoutes } from "./userPreferences.routes.js";

export const FrontendRoutes = [
  ...FrontendTriggerRoutes,
  ...FrontendJdyRoutes,
  ...UserPreferenceRoutes,
];
