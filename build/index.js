// import { AppDataSource } from "./data-source";
import "./config/env";
import express from "express";
import { PgDataSource } from "./config/data-source";
import { AppRoutes } from "./routes";
import cors from "cors";
import { insertApprovalToDb } from "./utils/wechat/temp";
import "./config/logger";
import { logger } from "./config/logger";
import { schedule } from "./schedule";
import { autoParse } from "./config/autoParse";
PgDataSource.initialize()
    .then(() => {
    logger.info("Data Source has been initialized!");
    const app = express();
    const port = parseInt(process.env.PORT);
    app.use(cors());
    app.use(autoParse);
    // register all application routes
    AppRoutes.forEach((route) => {
        app[route.method](route.path, (request, response, next) => {
            route
                .action(request, response)
                .then(() => next)
                .catch((err) => next(err));
        });
    });
    schedule.forEach((task) => {
        task.start();
    });
    insertApprovalToDb();
    // run app
    app.listen(port, () => {
        logger.info(`[server]: Server is running at http://localhost:${port}`);
    });
})
    .catch((err) => {
    logger.error("Error during Data Source initialization:", err);
});
process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection:", reason);
});
//# sourceMappingURL=index.js.map