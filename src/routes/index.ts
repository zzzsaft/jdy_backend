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
import { QuoteItemShareRoutes } from "./quoteItemShare";
import { UserRoutes } from "./user";
import { QuoteRuleRoutes } from "./quoteRule";
import { RuleRoutes } from "./rule";
import { ProductRoutes } from "./product";
import { TemplateRoutes } from "./template";
import { OrderRoutes } from "./order";

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
  ...QuoteItemShareRoutes,
  ...TemplateRoutes,
  ...QuoteRuleRoutes,
  ...RuleRoutes,
  ...ProductRoutes,
  ...OrderRoutes,
  ...UserRoutes,
];
