import { Request, Response } from "express";
import { logger } from "../config/logger";
import { ParkingRecord } from "../entity/DaHua/parkingRecords";
import { ParkingInfo } from "../entity/DaHua/parkingInfo";
import { EntryExistRecords } from "../entity/DaHua/entryExitRecord";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { downloadFile } from "../utils/general";

const sendInfo = {
  success: true,
  code: "0000",
  errMsg: "success",
  data: {},
};

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
  return response.send(sendInfo);
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
  return response.send(sendInfo);
};

export const entryExistRecord = async (
  request: Request,
  response: Response
) => {
  const data = request.body;
  await EntryExistRecords.addCarRecord(data);
  return response.send(sendInfo);
};

export const dahuaCallback = async (request: Request, response: Response) => {
  const data = request.body;
  const msgType = data["msgType"];
  if (msgType === "card.record") {
    await EntryExistRecords.addCardRecord(data);
  }
  return response.send(sendInfo);
};

export const downloadImage = async (url) => {
  return await downloadFile(url, `./public/images/${Date.now()}.jpg`);
};
