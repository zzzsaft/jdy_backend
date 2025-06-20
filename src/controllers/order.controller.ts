import { Request, Response } from "express";
import { logger } from "../config/logger";
import { appAxios } from "../utils/fileUtils";

export const getOrderInfo = async (request: Request, response: Response) => {
  const orderId = request.query.orderId as string;
  if (!orderId) {
    return response.status(400).send("Missing orderId");
  }
  try {
    const res = await appAxios({
      method: "GET",
      url: "http://122.226.146.110:777/api/GetOrder",
      params: { ordernum: orderId },
      timeout: 10000,
    });
    response.send(res.data);
  } catch (error) {
    logger.error(error);
    response.status(500).send("Failed to get order info");
  }
};
