import dotenv from "dotenv";
dotenv.config();
// AppDataSource.initialize()
//   .then(async () => {
//     const app = express();
//     const port = parseInt(process.env.PORT);
//     app.use(cors());
//     app.use(bodyParser.json());
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
//     // run app
//     app.listen(port, () => {
//       console.log(`[server]: Server is running at http://localhost:${port}`);
//     });
//   })
//   .catch((err) => {
//     console.error("Error during Data Source initialization:", err);
//   });
// checkinApiClient
//   .get_hardware_checkin_data({
//     starttime: new Date().getTime() / 1000 - 3600 * 24 * 4,
//     endtime: new Date().getTime() / 1000 - 3600 * 24 * 3,
//     useridlist: ["LuBin"],
//   })
//   .then((res) => {
//     console.log(res);
//   });
//# sourceMappingURL=index.js.map