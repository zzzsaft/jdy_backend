// import { AppDataSource } from "./data-source";
import "./config/env";
import express, { Request, Response } from "express";
import { AppDataSource, PgDataSource } from "./config/data-source";
import bodyParser from "body-parser";
import { AppRoutes } from "./routes";
import cors from "cors";
import { checkinApiClient } from "./utils/wechat/chekin";
import { getRtick } from "./utils/bestsign/util";
import { getCheckinData, initCheckinTable } from "./schedule/getCheckinData";
import { getApprovalDetail } from "./controllers/wechat/approval.wechat.controller";
import { insertApprovalToDb } from "./utils/wechat/temp";
import "./config/logger";
import { logger } from "./config/logger";
import { schedule } from "./schedule";
import { autoParse } from "./config/autoParse";
import { updateUserByJdy, updateUserList } from "./schedule/wechat";

PgDataSource.initialize()
  .then(async () => {
    logger.info("Data Source has been initialized!");
    const app = express();
    const port = parseInt(process.env.PORT);

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

    // schedule.forEach((task) => {
    //   task.start();
    // });
    // insertApprovalToDb();
    // run app
    app.listen(port, () => {
      logger.info(`[server]: Server is running at http://localhost:${port}`);
    });
    await updateUserList();
    // await updateUserByJdy();
  })
  .catch((err) => {
    logger.error("Error during Data Source initialization:", err);
  });
// process.on("unhandledRejection", (reason, promise) => {
//   logger.error("Unhandled Rejection:", reason);
// });
// getCheckinData.getNextRawCheckinData();
// console.log(await departmentApiClient.getDepartmentList());
