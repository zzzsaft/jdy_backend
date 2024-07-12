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
