/**
 * Feature jdy.register aggregated from src/features/<feature>/jdy.register.ts
 *
 * Keep this list as the single place to register feature jdy hooks.
 */
import "./hr/jdy.register";
import "./vehicle/controllers/jdy/jdy.register";
import "./jdy/jdy.register";
import "./dahua/jdy.register";
import "./crm/jdy.register";
import "./xft/controller/jdy.register";

import { BestSignRoutes } from "./bestsign/routes/bestsign.routes";
import { fenbeitongRoutes } from "./fbt/routes/fengbeitong";
import { parkingRoutes } from "./vehicle/routes/parking";
import { WechatRoutes } from "./wechat/route/wechat";
import { WechatOAuthRoutes } from "./wechat/route/wechatOAuth";
import { xftRoute } from "./xft/routes/xft";
import { CustomerRoutes } from "./crm/routes/customer";
import { OpportunityRoutes } from "./crm/routes/opportunity";
import { QuoteRoutes } from "./crm/routes/quote";
import { QuoteItemShareRoutes } from "./crm/routes/quoteItemShare";
import { QuoteRuleRoutes } from "./crm/routes/quoteRule";
import { ProductRoutes } from "./crm/routes/product";
import { OrderRoutes } from "./crm/routes/order";
import { RuleRoutes } from "./crm/routes/rule";
import { TemplateRoutes } from "./crm/routes/template";
import { UserRoutes } from "./crm/routes/user";

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
];
