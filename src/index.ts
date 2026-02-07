import "./config/env";
import "./config/logger";
import "./features";

import express, { Request, Response } from "express";
import { BaseEntity } from "typeorm";
import { AppDataSource, PgDataSource } from "./config/data-source";
import { AppRoutes } from "./routes";
import cors from "cors";
import { logger } from "./config/logger";
import { schedule } from "./schedule";
import { autoParse, expressLog, requestLimiter } from "./config/autoParse";
import { DatabaseTransport } from "./config/database-transport";
import path from "path";

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
    app.use(express.static(path.join(__dirname, "..", "public")));
    app.use(cors());
    app.use(autoParse);
    app.use(requestLimiter);
    app.use(expressLog);
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
schedule.forEach((task) => {
  task.start();
});
