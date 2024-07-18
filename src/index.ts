import "./config/env";
import "./config/logger";
import express, { Request, Response } from "express";
import { AppDataSource, PgDataSource } from "./config/data-source";
import { AppRoutes } from "./routes";
import cors from "cors";
import { logger } from "./config/logger";
import { schedule } from "./schedule";
import { autoParse } from "./config/autoParse";
import { syncUser } from "./schedule/syncXftData";
import { User } from "./entity/wechat/User";
import { importJdyToXft, reviseJdyToXft } from "./utils/xft/temp";

import { apiClient } from "./utils/parking/api_client";
import { parkingApiClient } from "./utils/parking/app";
import axios from "axios";
import { dahua_token } from "./utils/dahua/token";
import { fileApiClient } from "./utils/dahua/file";
import { punishCar } from "./controllers/jdy/parking.jdy.contollers";
import { ParkingRecord } from "./entity/DaHua/parkingRecords";
import { personApiClient } from "./utils/dahua/person";
import { ParkingInfo } from "./entity/DaHua/parkingInfo";
import {
  addtoDahua,
  saveExistInfo,
  updateExistInfo,
} from "./controllers/jdy/addPerson.controller";
import { EntryExistRecords } from "./entity/DaHua/entryExitRecord";

const ren = {
  // blockId: 2950,
  // cardNumber: "",
  // channelCode: "",
  // channelId: "0",
  // channelName: "DH-ASI7203C7DB-1",
  // channelSeq: "0",
  // checkResult: "2",
  // communityCode: "1a14e717a20e4c3a97fb8f978f218fa4",
  communityName: "新前梦工厂",
  // companyId: 700331383,
  // completeOrgName: "精诚时代集团有限公司",
  // cutImageDataVal:
  //   "https://yr-temp-storage-oss-bucket.oss-cn-hangzhou.aliyuncs.com/7day/700331383/20240718/11/34c8f010-b54d-4d99-a787-f3dae1c5680c.jpg?Expires=1721877716&OSSAccessKeyId=LTAI5tJw3rLMG3qjhWqCz26J&Signature=cDHGSlJB84YEZMsRitscozxRG%2Bc%3D",
  // dataVal:
  //   "https://yr-temp-storage-oss-bucket.oss-cn-hangzhou.aliyuncs.com/7day/700331383/20240718/11/bd014599-5ac5-4a46-9c3a-67dcc5afd1a3.jpg?Expires=1721877716&OSSAccessKeyId=LTAI5tJw3rLMG3qjhWqCz26J&Signature=%2BQawXTv%2Ft7fF0cei6VtbJbvgBLk%3D",
  // devType: 8,
  // deviceCode: "AC0F22DPAJ9C7DB",
  // deviceId: "AC0F22DPAJ9C7DB",
  // deviceName: "人脸pad2",
  enterOrExit: 1,
  eventTime: 1721296270000,
  // facePhotoPath:
  //   "https://yr-permanent-storage-oss-bucket.oss-cn-hangzhou.aliyuncs.com/personnel/personFace/700331383/20240715/14/8ac40b27-0f25-40b6-9c4a-f8856d39118f.jpg?Expires=1721877716&OSSAccessKeyId=LTAI5tJw3rLMG3qjhWqCz26J&Signature=YKfS1ceL4AJrUa5AODmUFRNgtJk%3D",
  id: "b62f1311-ce17-4e26-b7af-ac8f23a2b5ee",
  // msgType: "card.record",
  // openResult: 1,
  // personCode: "346884",
  personId: 1018672463503503360,
  // personName: "肖龙猛",
  // personStoreId: 332265869940375550,
  // personStoreName: "精诚时代集团有限公司",
  // recordType: 0,
  // roomNumber: "",
  // storeId: 342151936323772400,
  // storeName: "新前梦工厂",
  // subOrgCode: "",
  // type: 10015,
  // typeName: "人脸开门",
  // vaccineStatus: "2",
  // wearMask: "0",
};
const t = {
  parkingLotCode: "0001",
  laneCode: "1_X2Y1",
  parkingRecordId: "20240718OMoEInLKNodgDBzzGQ4Bw",
  carNum: "浙J3QF15",
  parkingLotId: "1806514428502343680_0001",
  carOutChnId: "1",
  parkingLotName: "停车场",
  carOutTime: "2024-07-18 12:46:36",
};
PgDataSource.initialize()
  .then(async () => {
    logger.info("Data Source has been initialized!");
    const app = express();
    const port = parseInt(process.env.PORT ?? "2002");
    app.use(cors());
    app.use(autoParse);
    // register all application routes
    AppRoutes.forEach((route) => {
      app[route.method](
        route.path,
        (request: Request, response: Response, next: Function) => {
          route
            .action(request, response)
            .then(() => next)
            .catch((err) => next(err));
        }
      );
    });
    // await ParkingRecord.testRecords();
    // await importJdyToXft();
    // await ParkingInfo.test();
    // await saveExistInfo();
    // await personApiClient.authAsync("1018709441070702592");
    // await EntryExistRecords.addCarRecord(t);

    // let a = await downloadImage(
    //   "https://parkingcloud-oss-bucket.oss-cn-hangzhou.aliyuncs.com/202407/18/smartparking_%7B187fcade-dcf0-472e-8014-6a93110a8092%7D.jpg?Expires=1721283413&OSSAccessKeyId=LTAI5tBv7kteUPCVAUV3SJAH&Signature=nhy58CjPYUlx6HvGxblKB%2FkvFpY%3D"
    // );
    // console.log(a);
    let a = await EntryExistRecords.addCardRecord(ren, "");
    console.log(a);
    // run app
    app.listen(port, () => {
      logger.info(`[server]: Server is running at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.log(err);
    logger.error("Error during Data Source initialization:", err);
  });

// process.on("unhandledRejection", (reason, promise) => {
//   logger.error("Unhandled Rejection:", reason);
// });
// schedule.forEach((task) => {
//   task.start();
// });
// console.log(apiClient.genHeaders({ carNum: "71" }));
// const result = await parkingApiClient.addCar({
//   carNum: "711",
//   carOwner: "张三",
//   phone: "18869965222",
//   beginTime: "2022-12-31",
//   endTime: "2025-12-31",
// });
// console.log(result);
// import * as fs from "fs";
// const a = fileApiClient.readFile(
//   "c:\\Users\\云创联动\\Desktop\\764612af-5c89-453e-9f4a-d3fb24e216be.jpeg"
// );
// const b = fs.statSync(
//   "c:\\Users\\云创联动\\Desktop\\764612af-5c89-453e-9f4a-d3fb24e216be.jpeg"
// );
// console.log(b.size);
// fileApiClient.uploadFile(a, "test.jpeg");
// console.log(await parkingApiClient.deleteCar("1811291729034870785"));
// console.log(
//   await parkingApiClient.updateCar({
//     id: "1810948145749790722",
//     carNum: "AF50977",
//     carOwner: "朱恩",
//     phone: "13291610209",
//     beginTime: "2024-06-10",
//     endTime: "2030-01-01",
//     userId: "ZhuEn",
//   })
// );
// console.log((await parkingApiClient.getCar({}))["result"]["records"]);

// await punishCar(a);
// console.log((await personApiClient.getOrgCode())["data"]["pageData"]);
