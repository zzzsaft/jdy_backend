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
