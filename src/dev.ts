import "./config/env";
import "./config/logger";

import express, { Request, Response } from "express";
import { AppDataSource, PgDataSource } from "./config/data-source";
import { AppRoutes } from "./routes";
import cors from "cors";
import { logger } from "./config/logger";
import { schedule } from "./schedule";
import { autoParse, expressLog, requestLimiter } from "./config/autoParse";
import { DatabaseTransport } from "./config/database-transport";
import { customerServices } from "./services/crm/customerService";
import { jctimesApiClient } from "./api/jctimes/app";
import { contactService } from "./services/crm/contactService";
import { xftatdApiClient } from "./api/xft/xft_atd";
import { User } from "./entity/basic/employee";
import { searchServices } from "./services/crm/searchService";
import { opportunityServices } from "./services/crm/opportunityService";
import { getCheckinData, importErrorAtd } from "./schedule/getCheckinData";
import { productService } from "./services/crm/productService";
import { handleWechatMessage } from "./controllers/wechat/wechat.controller";
import { xftTaskCallback } from "./controllers/xft/todo.xft.controller";
import { Department } from "./entity/basic/department";
import { employeeService } from "./services/md/employeeService";
import { supplierService } from "./services/srm/supplierService";
import { supplierGatherService } from "./services/srm/supplierGatherService";
import { receiveService } from "./services/crm/receiveService";
import { token_crm } from "./api/wechat/token";
import { wechatUserApiClient } from "./api/wechat/user";
import { authService } from "./services/authService";
import { sendButtonMsg } from "./services/jdy/businessTripCheckinServices";
import { XftTripCheckin } from "./entity/atd/business_trip_checkin";
import { gaoDeApiClient } from "./api/gaode/app";
import { quoteService } from "./services/crm/quoteService";
import { Quote } from "./entity/crm/quote";
import { MessageService } from "./services/messageService";
import { fbtApplyApiClient } from "./api/fenbeitong/apply";
import { fbtReimbApiClient } from "./api/fenbeitong/apply copy";
import { controllerMethod } from "./controllers/jdy/data.jdy.controller";
import { 修改config, 测试打印 } from "./temp";
import { checkinServices } from "./services/xft/checkinServices";

PgDataSource.initialize()
  .then(async () => {
    logger.info("Data Source has been initialized!");
    if (process.env.NODE_ENV == "production") {
      logger.add(new DatabaseTransport({ handleExceptions: true }));
    }
    await quoteService.fillItemsFromOrders();
    // await checkinServices.scheduleCheckinMonthly();
    // await getCheckinData.getNextCheckinData();
    // await checkinServices.scheduleCheckin();
    // await 测试打印();
    // await 修改config();
    // await quoteService.updateAllQuoteLinks();

    // await controllerMethod(a);
    // console.log(JSON.stringify(a));
    // const a = await Quote.findOne({
    //   where: {
    //     id: 357,
    //   },
    //   relations: ["items"],
    // });
    // console.log(JSON.stringify(a));
    // await customerServices.setCollaborator("100479", "LiangZhi");
    // await quoteService.addAlltoDb();
    // await contactService.reviseJdy();
    // await sendButtonMsg(await XftTripCheckin.findOne({ where: { id: 38 } }));
    // const a = await authService.jdySSO(
    //   "LiangZhi",
    //   "/dashboard#/app/6191e49fc6c18500070f60ca"
    // );
    // console.log(a);
    // await customerServices.addAlltoDb();
    // await User.updateUser();
    // await receiveService.processExcel();
    // await supplierGatherService.reviseAllJdy();
    // await employeeService.addJdyAlltoDb();
    // await xftTaskCallback(JSON.stringify(a));
    // await handleWechatMessage(a);
    // console.log(await productService.getProducts());
    // await productService.addAlltoDb();
    // await importErrorAtd();
    // const a = await opportunityServices.getOpportunity(
    //   "ChenYing1",
    //   []
    //   // "报价中"
    // );
    // await opportunityServices.addAlltoDb();
    // await User.updateUser();
    // await customerServices.addAlltoDb();
    // const b = await jctimesApiClient.getExternalContactDetailBatch([
    //   "jcyxbfhy",
    // ]);
    // const a = await contactService.bulkImportContactsData();
    // await searchServices.searchCompany("运城塑业（昆山）");
    const app = express();
    const port = parseInt(process.env.PORT ?? "2002");
    // app.use((err, req, res, next) => {
    //   console.error("Global error handler:", err);
    //   res.status(500).json({ error: "Internal server error" });
    // });
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
// schedule.forEach((task) => {
//   task.start();
// });
