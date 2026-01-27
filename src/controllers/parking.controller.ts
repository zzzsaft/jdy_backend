import { Request, Response } from "express";
import { logger } from "../config/logger";
import { ParkingRecord } from "../entity/parking/dh_parking_records";
import { ParkingInfo } from "../entity/parking/dh_car_info";
import { EntryExistRecords } from "../entity/parking/dh_entry_exit_record";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { downloadFile } from "../utils/fileUtils";
import { jdyFormDataApiClient } from "../features/jdy/api/form_data";

const sendInfo = {
  success: true,
  code: "0000",
  errMsg: "success",
  data: {},
};

export const parking = async (request: Request, response: Response) => {
  // logger.info(request.body);
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
  const url = data["carInPic"];
  const fileName = await downloadFile(
    url,
    `./public/images/car/${Date.now()}.jpg`
  );
  const info = await ParkingInfo.getInfoByCarNum(data["carNum"]);
  if (!info) {
    const jdyData = {
      _widget_1720546356355: { value: data["carNum"] },
      _widget_1720515048364: { value: data["carNum"] },
    };
    await jdyFormDataApiClient.singleDataCreate({
      app_id: "5cd65fc5272c106bbc2bbc38",
      entry_id: "669d0824ab60aa3f4acc9b8a",
      data: jdyData,
      options: { is_start_workflow: true },
    });
  }
  await EntryExistRecords.addCarRecord(data, fileName);
  return response.send(sendInfo);
};

export const dahuaCallback = async (request: Request, response: Response) => {
  const data = request.body;
  const msgType = data["msgType"];
  if (msgType === "card.record") {
    const url = data["dataVal"];
    const fileName = await downloadFile(
      url,
      `./public/images/card/${Date.now()}.jpg`
    );
    await EntryExistRecords.addCardRecord(data, fileName);
  }
  return response.send(sendInfo);
};
