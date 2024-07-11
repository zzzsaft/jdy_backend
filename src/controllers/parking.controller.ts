import { Request, Response } from "express";
import { logger } from "../config/logger";
import { ParkingRecord } from "../entity/DaHua/parking";

export const parking = async (request: Request, response: Response) => {
  logger.info(request.body);
  if (!request.body) {
    return response.status(400).send({ state: "fail" });
  }
  if (request.body["msgType"] === "parking") {
    await ParkingRecord.addRecord(request.body);
  }
  return response.send({ state: "success" });
};
