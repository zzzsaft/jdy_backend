import { Request, Response } from "express";
import { logger } from "../config/logger";
import { ParkingRecord } from "../entity/DaHua/parkingRecords";
import { ParkingInfo } from "../entity/DaHua/parkingInfo";

export const parking = async (request: Request, response: Response) => {
  logger.info(request.body);
  if (!request.body) {
    return response.status(400).send({ state: "fail" });
  }
  if (request.body["msgType"] === "car.record") {
    // await ParkingRecord.addRecord(request.body);
  }
  return response.send({ state: "success" });
};

export const inParking = async (request: Request, response: Response) => {
  if (!request.body) {
    return response.status(400).send({ state: "fail" });
  }
  const data = request.body;
  const carInfo = await ParkingInfo.getInfoByCarNum(data["carNum"]);
  await ParkingRecord.addRecord({
    parkingRecordId: data["parkingRecordId"],
    status: 0,
    ownerId: carInfo?.ownerId ?? "",
    ownerName: carInfo?.ownerName ?? "",
    ownerPhone: carInfo?.ownerPhone ?? "",
    isVisitor: 0,
    carNum: data["carNum"],
    carTime: data["carInTime"],
    carPic: data["carInPic"],
    laneCode: data["laneCode"],
  });
  return response.send({
    success: true,
    code: "0000",
    errMsg: "success",
    data: {},
  });
};

export const outParking = async (request: Request, response: Response) => {
  if (!request.body) {
    return response.status(400).send({ state: "fail" });
  }
  const data = request.body;
  const carInfo = await ParkingInfo.getInfoByCarNum(data["carNum"]);
  await ParkingRecord.addRecord({
    parkingRecordId: data["parkingRecordId"],
    status: 1,
    ownerId: carInfo?.ownerId ?? "",
    ownerName: carInfo?.ownerName ?? "",
    ownerPhone: carInfo?.ownerPhone ?? "",
    isVisitor: 0,
    carNum: data["carNum"],
    carTime: data["carOutTime"],
    carPic: data["carOutPic"],
    laneCode: data["laneCode"],
  });
  return response.send({
    success: true,
    code: "0000",
    errMsg: "success",
    data: {},
  });
};
