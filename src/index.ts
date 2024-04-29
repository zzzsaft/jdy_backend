import "./config/env";
import "./config/logger";
import express, { Request, Response } from "express";
import { AppDataSource, PgDataSource } from "./config/data-source";
import { AppRoutes } from "./routes";
import cors from "cors";
import { logger } from "./config/logger";
import { schedule } from "./schedule";
import { autoParse } from "./config/autoParse";
import { orgnizationApiClient } from "./utils/xft/orgnization";
import { updateDepartmentList } from "./schedule/wechat";
import { importDepartmentToXft, testRSA } from "./utils/xft/temp";
import { contactApiClient } from "./utils/wechat/contact";

PgDataSource.initialize()
  .then(async () => {
    logger.info("Data Source has been initialized!");
    const app = express();
    const port = parseInt(process.env.PORT ?? "2000");

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
    // console.log(await orgnizationApiClient.getOrgnization("187"));
    // run app
    testRSA();
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
// testRSA();
