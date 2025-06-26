import { Request, Response } from "express";
import { logger } from "../config/logger";
import { jctimesContractApiClient } from "../api/jctimes/contract";
import { Quote } from "../entity/crm/quote";
import { Customer } from "../entity/crm/customer";

export const getOrderInfo = async (request: Request, response: Response) => {
  const orderId = request.query.orderId as string;
  if (!orderId) {
    return response.status(400).send("Missing orderId");
  }
  const exist = await Quote.exists({ where: { orderId } });
  if (exist) {
    return response.status(400).send("订单号已存在");
  }
  try {
    const res = await jctimesContractApiClient.getOrder(orderId);
    const data = res?.[0];
    const cus = await Customer.findOne({
      where: { erpId: data.客户ID },
      select: ["name"],
    });
    if (cus && cus?.name != data.客户名称) {
      data.客户名称 = cus?.name;
    }
    response.send(data);
  } catch (error) {
    logger.error(error);
    response.status(500).send("Failed to get order info");
  }
};
