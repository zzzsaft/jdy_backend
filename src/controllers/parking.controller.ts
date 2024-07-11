import { Request, Response } from "express";
import { logger } from "../config/logger";

export const parking = async (request: Request, response: Response) => {
  logger.info(request.body);
  return response.send(request.body);
};
