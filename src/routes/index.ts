import { JdyRoutes } from "../features/frontend/JdyRoutes";
import { TriggerRoutes } from "../features/frontend/TriggerRoutes";
import { JdyDataRoutes } from "../features/jdy/routes";
import { parkingRoutes } from "../features/parking/routes";
import { UtilsRoutes } from "../features/utils/routes";
import { WechatOAuthRoutes } from "../features/wechat/wechatOAuth";
import { WechatRoutes } from "../features/wechat/wechat";
import { xftRoute } from "../features/xft/routes";
import { fenbeitongRoutes } from "../features/fengbeitong/routes";
import { CustomerRoutes } from "../features/customer/routes";
import { AuthRoutes } from "../features/auth/routes";
import { OpportunityRoutes } from "../features/opportunity/routes";
import { QuoteRoutes } from "../features/quote/routes";
import { QuoteItemShareRoutes } from "../features/quote-item-share/routes";
import { UserRoutes } from "../features/user/routes";
import { QuoteRuleRoutes } from "../features/quote-rule/routes";
import { RuleRoutes } from "../features/rule/routes";
import { ProductRoutes } from "../features/product/routes";
import { TemplateRoutes } from "../features/template/routes";
import { OrderRoutes } from "../features/order/routes";

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
