import "./config/env";
import "./config/logger";
import express, { Request, Response } from "express";
import { AppDataSource, PgDataSource } from "./config/data-source";
import { AppRoutes } from "./routes";
import cors from "cors";
import { logger } from "./config/logger";
import { schedule } from "./schedule";
import { autoParse } from "./config/autoParse";
import { testLoginUrl } from "./controllers/xft/login.xft.controller";

// PgDataSource.initialize()
//   .then(async () => {
//     logger.info("Data Source has been initialized!");
//     const app = express();
//     const port = parseInt(process.env.PORT ?? "2000");
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

<<<<<<< HEAD
    // run app
    app.listen(port, () => {
      logger.info(`[server]: Server is running at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.log(err);
    logger.error("Error during Data Source initialization:", err);
  });
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection:", reason);
});
schedule.forEach((task) => {
  task.start();
});
=======
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

console.log(testLoginUrl("LiZhangLi"));
>>>>>>> b80c2fae82ed04d25ef334190967b9e0b9d0cca7
