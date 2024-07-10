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
import { punishCar } from "./controllers/jdy/parking.jdy.contollers";

// PgDataSource.initialize()
//   .then(async () => {
//     logger.info("Data Source has been initialized!");
//     const app = express();
//     const port = parseInt(process.env.PORT ?? "2002");
//     app.use(cors());
//     app.use(autoParse);
//     // register all application routes
//     AppRoutes.forEach((route) => {
//       app[route.method](
//         route.path,
//         (request: Request, response: Response, next: Function) => {
//           route
//             .action(request, response)
//             .then(() => next)
//             .catch((err) => next(err));
//         }
//       );
//     });
//     // await importJdyToXft();
//     // run app
//     app.listen(port, () => {
//       logger.info(`[server]: Server is running at http://localhost:${port}`);
//     });
//   })
//   .catch((err) => {
//     console.log(err);
//     logger.error("Error during Data Source initialization:", err);
//   });
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
console.log((await parkingApiClient.getCar({}))["result"]["records"]);
const a = {
  _id: "668e4c60823aa6b594b5b96c",
  _widget_1720526149435: { id: "668e408138fe6de9132a996a" },
  _widget_1720526149436: "1810948145749790722",
  _widget_1720526149437: "浙AF50977",
  _widget_1720526149438: "LiangZhi",
  _widget_1720526149439: "梁之",
  _widget_1720526149440: "18869965222",
  _widget_1720526149442: "111",
  _widget_1720526149443: "三天",
  _widget_1720526330267: {
    _id: "6189db48c482520007e2e435",
    name: "梁之",
    status: 1,
    type: 0,
    username: "LiangZhi",
  },
  _widget_1720526330271: [],
  appId: "5cd65fc5272c106bbc2bbc38",
  createTime: "2024-07-10T08:54:56.793Z",
  creator: {
    _id: "6189db48c482520007e2e435",
    name: "梁之",
    status: 1,
    type: 0,
    username: "LiangZhi",
  },
  deleteTime: null,
  deleter: null,
  entryId: "668d244cbae980236ab4e62c",
  flowState: 1,
  formName: "车辆违停处罚流程",
  updateTime: "2024-07-10T08:54:32.182Z",
  updater: {
    _id: "6189db48c482520007e2e435",
    name: "梁之",
    status: 1,
    type: 0,
    username: "LiangZhi",
  },
};
// await punishCar(a);
