import "./config/env";
import "./config/logger";
import { PgDataSource } from "./config/data-source";
import { customerServices } from "./services/crm/customerService";
import { trafficService } from "./services/entryService";
import { xftatdApiClient } from "./api/xft/xft_atd";
import { testLoginUrl } from "./controllers/xft/login.xft.controller";
import {
  createBTcheckin,
  handleWechat,
  processPrecisionIssueData,
  processXftTripLog,
  testChangeShift,
  testJdyCreateTripCheckin,
  testJdyCreateTripCheckinSingle,
  testUpdateNextBusinessTrip,
  testXftEvent,
  testXftTrip,
  修复停车记录,
  导入分贝通人员id,
  导入外出打卡记录,
  授权大华人员,
  检查分贝通未导入id,
  测试补卡记录,
  // 测试补卡记录,
} from "./temp";
import { fbtUserApiClient } from "./api/fenbeitong/user";
import { fbtApplyApiClient } from "./api/fenbeitong/apply";
import { FbtApply } from "./entity/atd/fbt_trip_apply";
import { GetFbtApply, XftTripLog } from "./schedule/getFbtApply";
import { xftItripApiClient } from "./api/xft/xft_itrip";
import { XftCity } from "./entity/util/xft_city";
import { LogCheckin } from "./entity/log/log_checkin";
import { xftSalaryApiClient } from "./api/xft/xft_salary";
import { 转正 } from "./controllers/jdy/updateUser.jdy.controller";
import { parkingApiClient } from "./api/parking/app";
// customerServices.reviseAllJdy().then(() => {});

PgDataSource.initialize()
  .then(async () => {
    // console.log(await customerServices.findJdy("复合材料"));
    // await handleWechat();
    // await xftUserApiClient.getMapping("0000000290");
    // testLoginUrl("ChenYan");
    // console.log(await contactApiClient.getUser("LiangZhi"));
    // await customerServices.addToDbfromLog(414);
    // await customerServices.reviseAllJdy();
    // await testXftEvent();
  })
  .catch((error) => {
    console.error("初始化失败:", error);
  });
// console.log(await Department.isLeader("LiangZhi"));
// const xftOrg = (await xftOrgnizationApiClient.getOrgnizationList())["body"][
//   "records"
// ];
// const record = await Department.updateXftId();
// console.log(record);
// console.log(
//   await atdClassService.getWorkStartTime("AiXiaoLin", new Date("2025-01-06"))
// );
// await addCheckinToXFT();
// // const todo = await xftGeneralApiClient.getTodoList("V00JR");
// await trafficService.addOut(
//   83887,
//   new Date("2024-12-30 11:36:36"),
//   "JiangYeLong",
//   "蒋业龙"
// );
// await 测试补卡记录();

// console.log(await quotaServices.getSingleDayOffQuotaLeftByUserId("BaoMengYa"));
// await 导入外出打卡记录();
// await testXftEvent();
// console.log(await gaoDeApiClient.reGeo(41.0272, 28.6242));
// await locationService.addLocation(
//   "JianDianLong",
//   new Date("2024-12-04 21:04:46"),
//   28.6604,
//   121.194
// );
// await testLocation();
// await 修复停车记录();
// console.log(await quotaServices.getSingleDayOffQuotaLeftByUserId("LuBin2"));
// await createShiftExcel("202411");
// await addExistToXft();
// await addExistToXft();
// await 测试补卡记录();
// await updateDahua();
// await deleteDahuaId();
// await createBTcheckin();
// const a = await xftatdApiClient.getDayResult({
//   staffNumber: "ZhengJie",
//   attendanceDate: "2024-10-11",
// });
// console.log(JSON.parse(a["body"]["dayStaDtoList"][0]["attendanceItemResult"]));
// await checkinServices.scheduleCheckin();
// await checkinServices.scheduleCheckinMonthly();
// await sendXftTodoList();
// const a = await workflowApiClient.workflowInstanceGet(
//   "670c27ca3f18ccc122114ddb"
// );
// await testCron();
// await BusinessTripServices.scheduleCreate();
// await testXftTrip();
// await xftSalaryApiClient.setAtd();
// await parkingApiClient.getCarById("1846020091524780033");
// await 测试补卡记录();
// await messageApiClient.recall(
//   "ApdmTZacy5fwcrmY4C90rwjxWe3YwUC_55gM0aM1N39EjZCkVriwMg1u62PjqhoNbyr72LqZK6OcsHcjT-cTFg"
// );
// await BusinessTripCheckinServices.scheduleCreate(new Date("2024-10-25"));
// await insertWidgets("5cfef4b5de0b2278b05c8380", "67037803a6ba29ba0521efb2");
// await 获取空缺请假记录();
// const a = await FbtApply.findOne({
//   where: { id: "6709fa135e3eaa103beaccc5" },
//   relations: ["city", "user"],
// });
// if (a) {
//   await BusinessTripServices.createBusinessTrip(a);
// }
// const record = await xftatdApiClient.getOvertimeRecord("0000003134");
// console.log();
// await BusinessTripServices.scheduleCreate(new Date("2024-10-15"));
// await 获取未排班人员();
// console.log(a);
// await testJdyCreateTripCheckinSingle();
// await JdyForm.updateForm();
// await testXftTrip();

// testLoginUrl("ZhouYang");
// await testJdyCreateTripCheckinSingle();
// await BusinessTripCheckinServices.scheduleCreate();
// await SendTripCheckin.createBatchTripCheckin();
// await processPrecisionIssueData();
// await testCron();
// await processPrecisionIssueData();
// await processXftTripLog();
// const a = await xftOAApiClient.getFormData([
//   "CF_:604ec40b-3ab8-4b8b-a93e-9fac566ce49a:180e5b2247a64797",
// ]);
// await getTodoList();
// await SendTripCheckin.createBatchTripCheckin();
// await xftOAApiClient.trialCodeFriend({ trailVarJsonStr: { reason: "222" } });
// await SendTripCheckin.createByRootId("661e0b0c608b8f537df3b5a6");
// await processXftTripLog();
// const a = await fbtApplyApiClient.getApplyOrder("6703ab09ec07c26f03933818");
// console.log(a);
// const a1 =
//   '[{"nodeId":"d2c459cca2bd4861bfab1f879764fe19","nodeName":"开始","type":"START","subType":"bpm.start","assignType":null,"actionType":null,"approverUserList":[{"userId":"U0000","userName":"梁之","userPhone":"18869965222"}],"reason":null,"starterSelfSelectRequired":null},{"nodeId":"31863550864111efbb2be9be85076fbe","nodeName":"审批人","type":"APPROVE","subType":"trip.approve","assignType":"trip.user","actionType":"oneByOne","approverUserList":[{"userId":"U0000","userName":"梁之","userPhone":"18869965222"}],"reason":null,"starterSelfSelectRequired":null}]';
// const a3 = JSON.parse(a1);
// const msg = await parkingApiClient.visitorAppoint({
//   guestCompany: "合肥长阳",
//   guestType: "国内客户",
//   visitorCarNum: "",
//   visitorName: "韩先生，吴",
//   visitorPhone: "15825686848",
//   visitorPurpose: "售中验货",
//   visitorTime: "2024-09-12 09:08:00",
//   visitorLeaveTime: "2024-09-12 13:08:00",
//   visitorReason: "",
// });
// console.log(await importErrorAtd());
// const a = await xftOAApiClient.getFormBussinesData();
// console.log(new Date().getTime().toString());
// console.log(await testLoginUrl("WuFeng"));
import { Department } from "./entity/basic/department";
import { SendTripCheckin } from "./schedule/sendTripCheckin";
import { JdyForm } from "./entity/util/jdy_form";
import { workflowApiClient } from "./api/jdy/workflow";
import {
  sendMessage,
  updateNextBusinessTrip,
} from "./services/jdy/businessTripCheckinServices";
import { XftTripCheckin } from "./entity/atd/business_trip_checkin";
import { BusinessTripServices } from "./services/xft/businessTripServices";
import {
  checkinServices,
  获取未排班人员,
} from "./services/xft/checkinServices";
import { insertWidgets } from "./services/jdy/widgetServices";
import { quotaServices } from "./services/xft/quotaServices";
import { xftGeneralApiClient } from "./api/xft/xft_general";
import { sendXftTodoList } from "./schedule/sendXftTask";
import { jctimesApiClient } from "./api/jctimes/app";
import { personApiClient } from "./api/dahua/person";
import { deleteDahuaId, updateDahua } from "./services/dahuaServices";
import { atdClassService } from "./services/xft/atdClass.services";
import { dayResultServices } from "./services/xft/dayResultServices";
import { XftTaskEvent } from "./controllers/xft/todo.xft.controller";
import {
  addExistRecord,
  addExistToXft,
  createShiftExcel,
  restOvertimeServices,
} from "./services/jdy/restOvertimeServices";

import { addChengJiangCar } from "./services/carPlateServices";
import { JdyRestOvertime } from "./entity/atd/jdy_rest_overtime";
import { BaseEntity, IsNull, MoreThan, Not } from "typeorm";
import { testLocations } from "./controllers/wechat/wechat.controller";
import { gaoDeApiClient } from "./api/gaode/app";
import {
  locationService,
  testLocation,
  testLocation1,
} from "./services/locationService";
import { handleContactEvent } from "./controllers/wechat/contact.wechat.controller";
import { format } from "date-fns";
import { xftOrgnizationApiClient } from "./api/xft/xft_orgnization";
import { syncDepartment, syncUser } from "./schedule/syncXftData";
import { xftOAApiClient } from "./api/xft/xft_oa";
import { searchServices } from "./services/crm/searchService";
import { CustomerSearch } from "./entity/crm/customerSearch";
import { User } from "./entity/basic/employee";

import { Log } from "./entity/log/log";
import { importErrorAtd } from "./schedule/getCheckinData";
import { contactApiClient } from "./api/wechat/contact";
import { xftUserApiClient } from "./api/xft/xft_user";
import { agentTicket, corpTicket } from "./api/wechat/ticket";

// await handleContactEvent(
//   {
//     xml: {
//       ToUserName: { value: "wwd56c5091f4258911" },
//       FromUserName: { value: "sys" },
//       CreateTime: { value: "1734505952" },
//       MsgType: { value: "event" },
//       Event: { value: "change_contact" },
//       ChangeType: { value: "delete_party" },
//       Id: { value: "260" },
//     },
//   }["xml"]
// );
// import { attt } from "./controllers/xft/event.xft.controller";
// import { LogCheckin } from "./entity/common/log_checkin";
// import { xftSalaryApiClient } from "./utils/xft/xft_salary";
// import { 转正 } from "./controllers/jdy/updateUser.jdy.controller";
// import { parkingApiClient } from "./api/parking/app";
// // const a = await workflowApiClient.workflowInstanceGet(
// //   "670c27ca3f18ccc122114ddb"
// // );
// // await BusinessTripServices.scheduleCreate();
// // await testXftTrip();
// // await parkingApiClient.getCarById("1846020091524780033");
// // await testChangeShift();
// // await atdClassService.getClassWorkTime("0000000006");
// // await getCheckinData.addWangChao();
// // await BusinessTripServices.scheduleCreate(new Date("2024-10-18"));
// // await insertWidgets("5cfef4b5de0b2278b05c8380", "67037803a6ba29ba0521efb2");
// // await BusinessTripCheckinServices.scheduleCreate();
// await 获取空缺请假记录();
// // const a = await FbtApply.findOne({
// //   where: { id: "6709fa135e3eaa103beaccc5" },
// //   relations: ["city", "user"],
// // });
// // if (a) {
// //   await BusinessTripServices.createBusinessTrip(a);
// // }
// // const record = await xftatdApiClient.getOvertimeRecord("0000003134");
// // console.log();
// // await BusinessTripServices.scheduleCreate(new Date("2024-10-15"));
// // const a = await 获取未排班人员();
// // console.log(a);
// // await testJdyCreateTripCheckinSingle();
// // await JdyForm.updateForm();
// // await testXftTrip();

// // testLoginUrl("YuYaSha");
// // await testJdyCreateTripCheckinSingle();
// // await BusinessTripCheckinServices.scheduleCreate();
// // await SendTripCheckin.createBatchTripCheckin();
// // await processPrecisionIssueData();
// // await testCron();
// // await processPrecisionIssueData();
// // await processXftTripLog();
// // const a = await xftOAApiClient.getFormData([
// //   "CF_:604ec40b-3ab8-4b8b-a93e-9fac566ce49a:180e5b2247a64797",
// // ]);
// // await getTodoList();
// // await SendTripCheckin.createBatchTripCheckin();
// // await xftOAApiClient.trialCodeFriend({ trailVarJsonStr: { reason: "222" } });
// // await SendTripCheckin.createByRootId("661e0b0c608b8f537df3b5a6");
// // await processXftTripLog();
// // const a = await fbtApplyApiClient.getApplyOrder("6703ab09ec07c26f03933818");
// // console.log(a);
// // const a1 =
// //   '[{"nodeId":"d2c459cca2bd4861bfab1f879764fe19","nodeName":"开始","type":"START","subType":"bpm.start","assignType":null,"actionType":null,"approverUserList":[{"userId":"U0000","userName":"梁之","userPhone":"18869965222"}],"reason":null,"starterSelfSelectRequired":null},{"nodeId":"31863550864111efbb2be9be85076fbe","nodeName":"审批人","type":"APPROVE","subType":"trip.approve","assignType":"trip.user","actionType":"oneByOne","approverUserList":[{"userId":"U0000","userName":"梁之","userPhone":"18869965222"}],"reason":null,"starterSelfSelectRequired":null}]';
// // const a3 = JSON.parse(a1);
// // const msg = await parkingApiClient.visitorAppoint({
// //   guestCompany: "合肥长阳",
// //   guestType: "国内客户",
// //   visitorCarNum: "",
// //   visitorName: "韩先生，吴",
// //   visitorPhone: "15825686848",
// //   visitorPurpose: "售中验货",
// //   visitorTime: "2024-09-12 09:08:00",
// //   visitorLeaveTime: "2024-09-12 13:08:00",
// //   visitorReason: "",
// // });
// // console.log(await importErrorAtd());
// // const a = await xftOAApiClient.getFormBussinesData();
// // console.log(new Date().getTime().toString());
// // console.log(await testLoginUrl("WuFeng"));
// import { Department } from "./entity/basic/department";
// import { SendTripCheckin } from "./schedule/sendTripCheckin";
// import { JdyForm } from "./entity/util/jdy_form";
// import { workflowApiClient } from "./api/jdy/workflow";
// import {
//   BusinessTripCheckinServices,
//   sendMessage,
//   updateNextBusinessTrip,
// } from "./services/jdy/businessTripCheckinServices";
// import { XftTripCheckin } from "./entity/atd/business_trip_checkin";
// import { BusinessTripServices } from "./services/xft/businessTripServices";
// import { 获取未排班人员 } from "./services/xft/checkinServices";
// import { insertWidgets } from "./services/jdy/formServices";
// import { atdClassService } from "./services/fbt/atdClass.services";
// // import { attt } from "./controllers/xft/event.xft.controller";
// // import { LogCheckin } from "./entity/common/log_checkin";
// // import { xftSalaryApiClient } from "./utils/xft/xft_salary";
// // import { 转正 } from "./controllers/jdy/updateUser.jdy.controller";
// // await User.updateUser();
// // await syncUser();
// // console.log(testLoginUrl("f46bfca930da3f09a765"));

// // await (await XftTripLog.importLogbyId("6707565a66a5897ad562b22a")).process();

// // console.log(await testLoginUrl("ShiFangFang"));
// // // const a = await GetFbtApply.getApplyDetail("6704e67667bb5a7c9cb9d56a");
// // // await xftItripApiClient.getApplyTravelDetail(2024100829442232);
// // // const tripLog = await XftTripLog.importLogbyId("6702360ccc4c6f5ef98e7d02");
// // // await tripLog.process();

// // await testXFTSTFADD();

// // await new GetFbtApply().getApply();

// // await processXftTripLog();
// // await getTodayApply();

// // const fbtApply = await FbtApply.findOne({
// //   where: { id: "66d2d651d7e0722234d2fc60" },
// //   relations: ["city", "user"],
// // });
// // if (fbtApply) await 添加xft差旅记录(fbtApply);
// // // await 导入分贝通人员id();
// // console.log(
// //   await fbtUserApiClient.getSSOLink("wolP6zEQAAwE6_FJPB3yTnFsWWbIcsxA", "home")
// // );
// // const a = await xftItripApiClient.getAllCity();

// // const a = await fbtApplyApiClient.getApplyOrder("66d828482a985c6c1231f5be");console.log();
// // await getTodayApply();
// // const a1 = new MessageService(["LiangZhi", ""]);
// // // await 检查分贝通未导入id();
// // // const a2 = await fbtOrderApiClient.getCustomFormList({
// // //   approve_start_time: "2024-09-01",
// // //   approve_end_time: "2024-09-05",
// // // });
// // const a2 = await fbtApplyApiClient.getTripDetail("XAVYCSQAT24100600001");
// // await FbtApply.addApply(a2["data"]["apply"]);
// // // const a3 = await fbtApplyApiClient.getTripDetail("66d580ced7e0722234ec8d9f");
// // // const a4 = await fbtApplyApiClient.getTripDetail("66da3dea9870730ff375d6b5");
// // console.log();
// // await 导入分贝通人员id();
// // console.log(await fbtUserApiClient.getSSOLink("18869965222", "home"));
// // await 获取空缺请假记录();
// // // XftAtdLeave.maxLeaveRecSeq().then((a) => {
// // //   console.log(a);
// // // });
// // const rRecord = await xftatdApiClient.getLeaveRecord((1000005664).toString());
// // if (rRecord["returnCode"] == "SUC0000")
// //   await XftAtdLeave.addRecord(rRecord["body"]);
// // const a2 = (
// //   await LogAxios.find({
// //     where: {
// //       host: "api.cmbchina.com",
// //       url: Like("%record-add%"),
// //       res_data: Like("%SUC0000%"),
// //     },
// //   })
// // ).map((a) => JSON.parse(a.payload));
// // for (const a of a2) {
// //   const user = a["stfNumber"];
// //   const name = a["stfName"];
// //   let leaders = await User.getLeaderId(user);
// //   if (user == "LiangZhi") leaders = ["LiangZhi"];
// //   // await new MessageService([user, ...leaders]).sendTextNotice({
// //   //   main_title: {
// //   //     title: `(已自动通过)${name}的轮休假申请`,
// //   //     desc: "",
// //   //   },
// //   //   sub_title_text: "",
// //   //   card_action: {
// //   //     type: 1,
// //   //     url: "https://xft.cmbchina.com/mobile-atd/#/vacation-record",
// //   //   },
// //   //   horizontal_content_list: [
// //   //     { keyname: "请假类型", value: "轮休假" },
// //   //     {
// //   //       keyname: "开始时间",
// //   //       value: `${a.begDate} ${a.begTime} (${getDay(a.begDate)})`,
// //   //     },
// //   //     {
// //   //       keyname: "结束时间",
// //   //       value: `${a.endDate} ${a.endTime} (${getDay(a.endDate)})`,
// //   //     },
// //   //   ],
// //   // });
// // }

// // await handleMessageEvent(a);
// // new MessageService(["LiangZhi"]).send_plain_text(
// //   '<a href="https://xft.cmbchina.com/mobile-atd/#/vacation-record">请假记录</a>'
// // );

// //   .then(async () => {
// //     // const a = await xftatdApiClient.getAllSingleDayOffQuotaLeft();
// //     // console.log();
// //     // await sendtoUserwithLeaveChoice();
// //     // await testaaaaa();
// //     // await sendtoUserwithLeaveChoiceTest();
// //     // console.log(await User.getLeaderId("LuBin"));
// //   })
// //   .catch((e) => {
// //     console.log(e);
// //   });
// // await importErrorAtd();
// // const a = JSON.parse(
// //   (await xftOAApiClient.getFormData(["FORM_253749010760794112"]))["body"][0][
// //     "formData"
// //   ]
// // );

// // const a = await xftOAApiClient.getFormData(["FORM_AAA00512_00000049"]);

// // console.log;
// // const a = await xftatdApiClient.getBusinessTripRecord({
// //   staffNameOrStaffNumber: "雷登曦",
// // });
// // const a = await xftatdApiClient.getAllSingleDayOffQuotaLeft();
// // console.log(await testLoginUrl("LiangZhi"));
// // await xftUserApiClient.getEmployeeDetail("0000000263");
// // await xftUserApiClient.getMapping("0000000001");
// // await xftUserApiClient.getMapping("0000000263");
// // await xftUserApiClient.updateMapping("0000000263", "LiuYong");
// console.log(await quotaServices.getSingleDayOffQuotaLeftByUserId("LiangZhi"));
// const a = await quotaServices.getAllSingleDayOffQuotaLeft();
// const result = Object.entries(a)
//   .filter(([key, value]) => value.left < 0)
//   .map(([key]) => key);
// console.log(result);
// // console.log(process.env.FBT_NAME);
// // await fbtOrderApiClient.getFormList({
// //   create_start_time: "2024-08-01",
// //   create_end_time: "2024-08-30",
// // });
// // await fbtOrderApiClient.test();
// // await xftatdApiClient.getAtdType();
// // await xftatdApiClient.addOvertime({
// //   staffName: "杨萍丽",
// //   staffNumber: "YangPingLi",
// //   overtimeDate: "2024-09-02",
// //   beginTime: "17:20",
// //   beginTimeType: "当日",
// //   endTime: "18:50",
// //   endTimeType: "当日",
// //   overtimeReason: "圆模加班",
// // });
// // for (let i = 0; i < 28; i++) {
// //   await LogExpress.updateWechatEventLog();
// // }
// // console.log(await importErrorAtd());
// // console.log(await xftUserApiClient.getEmployeeDetail("0000000263"));
// // console.log(testLoginUrl("LiuYong"));

// // console.log(
// //   getDateRanges([
// //     "2024-09-23/PM",
// //     "2024-09-23/AM",
// //     "2024-09-24/AM",
// //     "2024-09-24/PM",
// //   ])[0]
// // );
// // await xftOAApiClient.getForm();

// // const a = await fengbeitong_token.get_token();
// // console.log();
// // await xftOAApiClient.getFormData(["FORM_252268610697363456"]);
// // await new OvertimeEvent(
// //   new XftTaskEvent(JSON.stringify(lunxiujia))
// // ).getRecord();
// // await sendLeave(
// //   {
// //     userid: "LiangZhi",
// //     stfSeq: "",
// //     stfName: "",
// //     orgSeq: "",
// //   },
// //   4
// // );
// // let a = await xftOAApiClient.getFormData(["SALD_AAA00512_0000001846"]);
// // console.log(a);
// // await xftTaskCallback(JSON.stringify(lunxiujia));
// // const a = new XftTaskEvent(JSON.stringify(lunxiujia));
// // await a.getWxUserId();
// // const b = await xftOAApiClient.operate(a.operateConfig("pass"));
// // console.log(b);
// // await b.getRecord();
// // await b.sendNotice("LiangZhi");
// // console.log(await b.passOA());
// // const ab = {};
// // // // // const a = await contactApiClient.getUser("LiangZhi");
// // await LogExpress.updateXftEventLog();
// // const a = await xftatdApiClient.getLeaveRecord("1000000027");
// // const a = await xftatdApiClient.getAtdType();
// // console.log(a);
// // await testWechatWebhook();
// // await 转正(ab["data"]);
// // await importErrorAtd();
// // console.log();
// // // // // const a = await testWechatWebhook();

// // // // console.log(a);
