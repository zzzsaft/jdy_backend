import "./config/env.js";
import "./config/logger.js";

import express, { Request, Response } from "express";
import { BaseEntity } from "typeorm";
import { AppDataSource, PgDataSource } from "./config/data-source.js";
import { AppRoutes } from "./routes/index.js";
import cors from "cors";
import { logger } from "./config/logger.js";
import { schedule } from "./schedule/index.js";
import { autoParse, expressLog, requestLimiter } from "./config/autoParse.js";
import { DatabaseTransport } from "./config/database-transport.js";
import { customerServices } from "./services/crm/customerService.js";
import { jctimesApiClient } from "./api/jctimes/app.js";
import { contactService } from "./services/crm/contactService.js";
import { User } from "./entity/basic/employee.js";
import { searchServices } from "./services/crm/searchService.js";
import { opportunityServices } from "./services/crm/opportunityService.js";
import { getCheckinData, importErrorAtd } from "./schedule/getCheckinData.js";
import { productService } from "./services/crm/productService.js";
import { handleWechatMessage } from "./features/wechat/controller/wechat.controller.js";
import { xftTaskCallback } from "./features/xft/controller/todo.xft.controller.js";
import { Department } from "./entity/basic/department.js";
import { employeeService } from "./services/md/employeeService.js";
import { supplierService } from "./services/srm/supplierService.js";
import { supplierGatherService } from "./services/srm/supplierGatherService.js";
import { receiveService } from "./services/crm/receiveService.js";
import { authService } from "./services/authService.js";
import { sendButtonMsg } from "./features/jdy/service/businessTripCheckinServices.js";
import { XftTripCheckin } from "./entity/atd/business_trip_checkin.js";
import { gaoDeApiClient } from "./api/gaode/app.js";
import { quoteService } from "./services/crm/quoteService.js";
import { Quote } from "./entity/crm/quote.js";
import { MessageService } from "./features/wechat/service/messageService.js";
import { controllerMethod } from "./controllers/jdy/data.jdy.controller.js";
import { logTripSyncByid, 修改config, 测试打印 } from "./temp.js";
import { checkinServices } from "./features/xft/service/checkinServices.js";
import { templatesApiClient } from "./features/bestsign/api/template.js";
import { bestSignToken } from "./features/bestsign/api/token.js";
import { GetFbtApply } from "./schedule/getFbtApply.js";
import { BusinessTripServices } from "./features/xft/service/businessTripServices.js";
import { syncDepartments } from "./features/wechat/service/departmentService.js";
import { OrgnizationService } from "./features/xft/service/orgnizationService.js";
import { LogAxios } from "./features/log/entity/log_axios.js";
import { vehicleService } from "./features/vehicle/services/vehicleService.js";
import { BestSignContractRecord } from "./features/bestsign/entity/contractRecord.js";
import { hrContractService } from "./features/hr/service/hrContractService.js";
import { hrEmployeeArchiveService } from "./features/hr/service/hrEmployeeArchiveService.js";
import _ from "lodash";
import { bestSignContractService } from "./features/bestsign/service/bestSignContractService.js";
import { bestSignMaintenanceService } from "./features/bestsign/service/bestSignMaintenanceService.js";
import { main } from "./features/hr/service/test.js";
import { backgroundJobService } from "./features/backgroundJob/index.js";
import { browserAuthMiddleware, browserCorsOptions } from "./middleware/browserAuth.js";
const { uniqueId } = _;
// main();

// (Dev-only switches call into services; keep dev.ts thin.)
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

    // const approveResult = await templatesApiClient.approveTemplate(
    //   "3364564979671753730"
    // );

    // await controllerMethod();

    // const record = await BestSignContractRecord.findOne({ where: { id: 1 } });
    // if (record?.contractId && record?.jdyId) {
    //   await bestSignContractService.uploadBeforeApprovalAttachment(
    //     record.contractId,
    //     record.jdyId,
    //     record.bizNo
    //   );
    // } else {
    //   logger.warn("Dev: missing record 1 contractId/jdyId", {
    //     contractId: record?.contractId,
    //     jdyId: record?.jdyId,
    //   });
    // }
    // await bestSignContractService.handleNotification({
    //   clientId: "1690083812011386745",
    //   responseData: {
    //     customContractId: "",
    //     operationStatus: "SIGN_SUCCEED",
    //     bizNo: "1597260310",
    //     message: "签署成功",
    //     senderEnterpriseName: "浙江精诚时代科技股份有限公司",
    //     receiverId: 4062911007566979000,
    //     contractId: 4062910996259135493,
    //     roleName: "员工",
    //     signType: "SIGNATURE",
    //     userType: "PERSON",
    //     senderUserAccount: "18869965222",
    //     enterpriseName: "",
    //     originUserAccounts: ["18869965222"],
    //   },
    //   timestamp: "1773085569747",
    //   type: "OPERATION_COMPLETE",
    // });

    if (process.env.SYNC_EMP_ARCHIVE_JDY_ID === "1") {
      // One-time backfill: md_employee.jdy_id from JDY employee archive.
      await hrEmployeeArchiveService.syncAllEmployeeArchiveJdyIdsToDb();
    }

    if (process.env.REPLAY_BESTSIGN_NOTIFY_LOG === "1") {
      const fromText =
        process.env.REPLAY_BESTSIGN_NOTIFY_LOG_FROM ??
        "2025-03-12T12:00:00+08:00";
      const from = new Date(fromText);
      const limit = process.env.REPLAY_BESTSIGN_NOTIFY_LOG_LIMIT
        ? Number(process.env.REPLAY_BESTSIGN_NOTIFY_LOG_LIMIT)
        : undefined;
      await bestSignMaintenanceService.replayNotifyLogs({ from, limit });
    }

    if (process.env.FIX_HR_JDY_STATUS_AND_FILES === "1") {
      const limit = process.env.FIX_HR_JDY_STATUS_AND_FILES_LIMIT
        ? Number(process.env.FIX_HR_JDY_STATUS_AND_FILES_LIMIT)
        : undefined;
      await bestSignMaintenanceService.fixHrJdyStatusAndFiles({ limit });
    }

    // await bestSignContractService.signContract({ bizNo: "1610260310" });
    const app = express();
    const port = parseInt(process.env.PORT ?? "2002");
    // app.use((err, req, res, next) => {
    //   console.error("Global error handler:", err);
    //   res.status(500).json({ error: "Internal server error" });
    // });
    app.use(cors(browserCorsOptions()));
    app.use(browserAuthMiddleware);
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
    backgroundJobService.startWorker();
    // console.log(a);
  })
  .catch((err) => {
    console.log(err);
    logger.error("Error during Data Source initialization:", err);
  });
// schedule.forEach((task) => {
//   task.start();
// });
