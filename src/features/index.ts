/**
 * Feature jdy.register aggregated from src/features/<feature>/jdy.register.ts
 *
 * Keep this list as the single place to register feature jdy hooks.
 */
import "./hr/jdy.register.js";
import "./vehicle/controllers/jdy/jdy.register.js";
import "./jdy/jdy.register.js";
import "./dahua/jdy.register.js";
import "./crm/jdy.register.js";
import "./xft/controller/jdy.register.js";
import "./bestsign/jdy.register.js";

import { BestSignRoutes } from "./bestsign/routes/bestsign.routes.js";
import { fenbeitongRoutes } from "./fbt/routes/fengbeitong.js";
import { parkingRoutes } from "./vehicle/routes/parking.js";
import { WechatRoutes } from "./wechat/route/wechat.js";
import { WechatOAuthRoutes } from "./wechat/route/wechatOAuth.js";
import { xftRoute } from "./xft/routes/xft.js";
import { CustomerRoutes } from "./crm/routes/customer.js";
import { OpportunityRoutes } from "./crm/routes/opportunity.js";
import { QuoteRoutes } from "./crm/routes/quote.js";
import { QuoteItemShareRoutes } from "./crm/routes/quoteItemShare.js";
import { QuoteRuleRoutes } from "./crm/routes/quoteRule.js";
import { ProductRoutes } from "./crm/routes/product.js";
import { OrderRoutes } from "./crm/routes/order.js";
import { RuleRoutes } from "./crm/routes/rule.js";
import { TemplateRoutes } from "./crm/routes/template.js";
import { UserRoutes } from "./crm/routes/user.js";
import { FrontendRoutes } from "./frontend/routes/index.js";

export const FeatureRoutes = [
  ...BestSignRoutes,
  ...fenbeitongRoutes,
  ...parkingRoutes,
  ...WechatRoutes,
  ...WechatOAuthRoutes,
  ...xftRoute,
  ...CustomerRoutes,
  ...OpportunityRoutes,
  ...QuoteRoutes,
  ...QuoteItemShareRoutes,
  ...QuoteRuleRoutes,
  ...ProductRoutes,
  ...OrderRoutes,
  ...RuleRoutes,
  ...TemplateRoutes,
  ...UserRoutes,
  ...FrontendRoutes,
];
