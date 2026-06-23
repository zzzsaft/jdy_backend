import "./config/env.js";
import "./config/logger.js";
import "./features/index.js";

import express, { Request, Response } from "express";
import { BaseEntity } from "typeorm";
import { AppDataSource, PgDataSource } from "./config/data-source.js";
import { AppRoutes } from "./routes/index.js";
import cors from "cors";
import { logger } from "./config/logger.js";
import { schedule } from "./schedule/index.js";
import { autoParse, expressLog, requestLimiter } from "./config/autoParse.js";
import { DatabaseTransport } from "./config/database-transport.js";
import { backgroundJobService } from "./features/backgroundJob/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateWechatAuthClients } from "./features/wechat/wechatCorps.js";
import { validateAuthSecrets } from "./utils/jwt.js";
import {
  browserAuthMiddleware,
  browserCorsOptions,
} from "./middleware/browserAuth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

validateAuthSecrets();
validateWechatAuthClients();

PgDataSource.initialize()
  .then(async () => {
    logger.info("Data Source has been initialized!");
    BaseEntity.useDataSource(PgDataSource);
    if (
      process.env.NODE_ENV == "production" &&
      !logger.transports.some((t) => t instanceof DatabaseTransport)
    ) {
      logger.info("DatabaseTransport added to logger");
      logger.add(new DatabaseTransport({ handleExceptions: true }));
    }
    const app = express();
    const port = parseInt(process.env.PORT ?? "2002");
    app.use(express.static(path.join(process.cwd(), "public")));
    app.use(cors(browserCorsOptions()));
    app.use(browserAuthMiddleware);
    app.use(autoParse);
    app.use(requestLimiter);
    app.use(expressLog);
    // register all application routes
    AppRoutes.forEach((route) => {
      (app as any)[route.method](
        route.path,
        async (request: Request, response: Response, next: Function) => {
          try {
            await route.action(request, response);
          } catch (err) {
            next(err);
          }
        },
      );
    });
    // run app
    app.listen(port, () => {
      logger.info(`[server]: Server is running at http://localhost:${port}`);
    });
    backgroundJobService.startWorker();
    // console.log(a);
  })
  .catch((err) => {
    console.log(err);
    logger.error("Error during Data Source initialization:", err);
  });
schedule.forEach((task) => {
  task.start();
});
