import "./config/env";
import "./config/logger";

import express, { Request, Response } from "express";
import { BaseEntity } from "typeorm";
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
import { User } from "./entity/basic/employee";
import { searchServices } from "./services/crm/searchService";
import { opportunityServices } from "./services/crm/opportunityService";
import { getCheckinData, importErrorAtd } from "./schedule/getCheckinData";
import { productService } from "./services/crm/productService";
import { handleWechatMessage } from "./features/wechat/controller/wechat.controller";
import { xftTaskCallback } from "./features/xft/controller/todo.xft.controller";
import { Department } from "./entity/basic/department";
import { employeeService } from "./services/md/employeeService";
import { supplierService } from "./services/srm/supplierService";
import { supplierGatherService } from "./services/srm/supplierGatherService";
import { receiveService } from "./services/crm/receiveService";
import { authService } from "./services/authService";
import { sendButtonMsg } from "./features/jdy/service/businessTripCheckinServices";
import { XftTripCheckin } from "./entity/atd/business_trip_checkin";
import { gaoDeApiClient } from "./api/gaode/app";
import { quoteService } from "./services/crm/quoteService";
import { Quote } from "./entity/crm/quote";
import { MessageService } from "./features/wechat/service/messageService";
import { controllerMethod } from "./controllers/jdy/data.jdy.controller";
import { logTripSyncByid, 修改config, 测试打印 } from "./temp";
import { checkinServices } from "./features/xft/service/checkinServices";
import { templatesApiClient } from "./features/bestsign/api/template";
import { bestSignToken } from "./features/bestsign/api/token";
import { GetFbtApply } from "./schedule/getFbtApply";
import { BusinessTripServices } from "./features/xft/service/businessTripServices";
import { syncDepartments } from "./features/wechat/service/departmentService";
import { OrgnizationService } from "./features/xft/service/orgnizationService";
import { LogAxios } from "./entity/log/log_axios";
import { vehicleService } from "./features/vehicle/services/vehicleService";

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
    // await quoteService.fillItemsFromOrders();
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
    // const a1 = await bestSignToken.get_token();

    // await vehicleService.disableCarIfUserLeft();

    // await BusinessTripServices.修正冲突时间并上传xft();
    // await BusinessTripServices.syncFbtAppliesToBusinessTrip({
    //   month: new Date("2026/2/1"),
    //   // fbtRootId: "69801bf3c459d642890896c4",
    // });

    // await syncDepartments();
    // await GetFbtApply.syncMissingXftTrips({ month: new Date("2026/1/1") });
    // await logTripSyncByid("69784460f16f745b3b3a68df");
    // const a = await templatesApiClient.getTemplates();
    // console.log(a);
    // await importErrorAtd();
    // await OrgnizationService.syncDepartment();
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
