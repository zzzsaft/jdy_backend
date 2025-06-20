import { getOrderInfo } from "../controllers/order.controller";

export const OrderRoutes = [
  {
    path: "/order/get",
    method: "get",
    action: getOrderInfo,
  },
];
