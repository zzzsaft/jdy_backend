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
import { Department } from "./entity/wechat/Department";

const ren = {
  communityName: "新前梦工厂",
  enterOrExit: 2,
  eventTime: "2024-07-18 20:51:35",
  id: "b62f1311-ce17-4e26-b7af-ac8f23a2b5ee",
  personId: 1018671625380896768,
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

    // const msg = await parkingApiClient.visitorAppoint({
    //   guestCompany: "123",
    //   guestType: "123",
    //   inviteStatus: 1,
    //   visitorCarNum: "浙AF50971",
    //   visitorLeaveTime: "2024-07-18 22:51:35",
    //   visitorName: "张三",
    //   visitorPhone: "18869965222",
    //   visitorPurpose: "",
    //   visitorReason: "123",
    //   visitorTime: "2024-07-18 20:51:35",
    // });
    // console.log(msg);

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
