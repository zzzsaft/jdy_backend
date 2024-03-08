// import { AppDataSource } from "./data-source";
import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { AppDataSource } from "./data-source";
import bodyParser from "body-parser";
import { AppRoutes } from "./routes";
import cors from "cors";
dotenv.config();

AppDataSource.initialize()
  .then(async () => {
    const app = express();
    const port = parseInt(process.env.PORT);

    app.use(cors());
    app.use(bodyParser.json());

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
      console.log(`[server]: Server is running at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Error during Data Source initialization:", err);
  });
