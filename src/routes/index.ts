import { JdyRoutes } from "./frontend/JdyRoutes";
import { TriggerRoutes } from "./frontend/TriggerRoutes";
import { JdyDataRoutes } from "./jdy";
import { parkingRoutes } from "./parking";
import { UtilsRoutes } from "./utils";
import { WechatOAuthRoutes } from "./wechat/wechatOAuth";
import { WechatRoutes } from "./wechat/wechat";
import { xftRoute } from "./xft";
import { fenbeitongRoutes } from "./fengbeitong";
import { CustomerRoutes } from "./customer";
import { AuthRoutes } from "./auth";
import { OpportunityRoutes } from "./opportunity";
import { QuoteRoutes } from "./quote";
import { UserRoutes } from "./user";
import { PriceRuleRoutes } from "./priceRule";
import { ProductRoutes } from "./product";

/**
 * All application routes.
 */
export const AppRoutes = [
  ...TriggerRoutes,
  ...JdyRoutes,
  ...WechatRoutes,
  ...WechatOAuthRoutes,
  ...xftRoute,
  ...UtilsRoutes,
  ...JdyDataRoutes,
  ...parkingRoutes,
  ...fenbeitongRoutes,
  ...CustomerRoutes,
  ...AuthRoutes,
  ...OpportunityRoutes,
  ...QuoteRoutes,
  ...PriceRuleRoutes,
  ...ProductRoutes,
  ...UserRoutes,
];
