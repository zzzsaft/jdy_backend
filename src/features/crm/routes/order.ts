import { getOrderInfo } from "../../../controllers/order.controller.js";

export const OrderRoutes = [
  {
    path: "/order/get",
    method: "get",
    action: getOrderInfo,
  },
];
