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
import { approvalApiClient } from "./utils/wechat/approval";
import { bestSignToken } from "./utils/bestsign/token";
import { contractApiClient } from "./utils/bestsign/contract";
import { WechatMessage } from "./entity/wechat/message";
import { DatabaseTransport } from "./config/database-transport";
import { xftTodoCallback } from "./controllers/xft/todo.xft.controller";
import { xftOAApiClient } from "./utils/xft/xft_oa";
import { MessageHelper } from "./utils/wechat/message";
import { testLoginUrl } from "./controllers/xft/login.xft.controller";

PgDataSource.initialize()
  .then(async () => {
    logger.info("Data Source has been initialized!");
    if (process.env.NODE_ENV == "production") {
      logger.add(new DatabaseTransport({ handleExceptions: true }));
    }
    const app = express();
    const port = parseInt(process.env.PORT ?? "2002");
    app.use(cors());
    app.use(autoParse);
    // register all application routes
    // xftTodoCallback(JSON.stringify(a));
    // console.log(await User.getXftId("LuMingLiu"));
    // await User.updateXftId();
    await importJdyToXft();
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
    // run app
    app.listen(port, () => {
      logger.info(`[server]: Server is running at http://localhost:${port}`);
    });
    // console.log(a);
  })
  .catch((err) => {
    console.log(err);
    logger.error("Error during Data Source initialization:", err);
  });
const a = {
  appCode: "xft-bpm",
  appName: "OA审批",
  businessCode: "OA000001",
  businessName: "待审批通知",
  businessParam: "FORM_244967396070195200",
  createTime: "2024-08-13 14:37:14",
  dealStatus: "0",
  details:
    "【梁之】发起了【出差】申请，申请人：梁之，出差行程：123-123，出差日期：2024-08-13 上午 到 2024-08-13 下午，出差天数：1，请您尽快审批，发起时间：2024-08-13 14:37:13。",
  id: "TD1823247420399656962",
  processId: "969188730",
  processStatus: "0",
  receiver: {
    enterpriseNum: "AAA00512",
    thirdpartyUserId: "",
    userName: "梁之",
    xftUserId: "U0000",
  },
  sendTime: "2024-08-13T14:37:13",
  sendUser: {
    enterpriseNum: "AAA00512",
    thirdpartyUserId: "",
    userName: "梁之",
    xftUserId: "U0000",
  },
  terminal: "0",
  title: "梁之发起的出差",
  url: {},
};
const reject = {
  approverId: "U0000",
  operateType: "reject",
  busKey: "FORM_244967396070195200",
  taskId: "969188730",
};
// console.log(testLoginUrl("KeTingTing"));
// await xftOAApiClient.operate(reject);
// process.on("unhandledRejection", (reason, promise) => {
//   logger.error("Unhandled Rejection:", reason);
// });
// schedule.forEach((task) => {
//   task.start();
// });
