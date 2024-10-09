import "./config/env";
import "./config/logger";
import { PgDataSource } from "./config/data-source";
import { testWechatWebhook } from "./controllers/wechat/wechat.controller";
import {
  endOfWeek,
  format,
  getISOWeek,
  compareAsc,
  eachDayOfInterval,
  endOfMonth,
  subMonths,
  startOfMonth,
  isSaturday,
} from "date-fns";
import { xftOAApiClient } from "./utils/xft/xft_oa";
// // import { contactApiClient } from "./utils/wechat/contact";
// // import { createUser } from "./controllers/wechat/contact.wechat.controller";
// // import { addEmployeeToXft } from "./controllers/jdy/addPerson.controller";
// // import { xftUserApiClient } from "./utils/xft/xft_user";

// import { importJdyToXft } from "./utils/xft/temp";
import { xftatdApiClient } from "./utils/xft/xft_atd";
import { importErrorAtd } from "./schedule/getCheckinData";
import { LogExpress } from "./entity/common/log_express";
import {
  xftTaskCallback,
  XftTaskEvent,
} from "./controllers/xft/todo.xft.controller";

import { testLoginUrl } from "./controllers/xft/login.xft.controller";
import { xftUserApiClient } from "./utils/xft/xft_user";
import { testCron } from "./schedule/testCron";
import {
  getWeekendDates,
  sendLeave,
  sendtoUserwithLeaveChoice,
  sendtoUserwithLeaveChoiceTest,
} from "./schedule/sendLeave";
import { decryptMsg } from "./utils/wechat/decrypt";
import { syncUser } from "./schedule/syncXftData";
import { fengbeitong_token } from "./utils/fenbeitong/token";
import { BusinessTripEvent } from "./controllers/xft/atd/businessTrip.atd.xft.controller";
import { User } from "./entity/wechat/User";
import {
  handleMessageEvent,
  testaaaaa,
} from "./controllers/wechat/message.wechat.controller";
import { XftAtdLeave } from "./entity/xft/leave";
import { MessageHelper } from "./utils/wechat/message";
import { LogAxios } from "./entity/common/log_axios";
import { Like } from "typeorm";
import { createWechatUrl, getDay } from "./utils/general";
import {
  processXftTripLog,
  导入分贝通人员id,
  检查分贝通未导入id,
  测试补卡记录,
  获取空缺请假记录,
} from "./temp";
import { fbtUserApiClient } from "./utils/fenbeitong/user";
import { fbtApplyApiClient } from "./utils/fenbeitong/apply";
import { FbtApply } from "./entity/fbt/apply";
import { GetFbtApply, XftTripLog } from "./schedule/getFbtApply";
import { xftItripApiClient } from "./utils/xft/xft_itrip";
import { XftCity } from "./entity/xft/city";
// import { LogCheckin } from "./entity/common/log_checkin";
// import { xftSalaryApiClient } from "./utils/xft/xft_salary";
// import { 转正 } from "./controllers/jdy/updateUser.jdy.controller";await PgDataSource.initialize();
console.log(await testLoginUrl("ShiFangFang"));
// // const a = await GetFbtApply.getApplyDetail("6704e67667bb5a7c9cb9d56a");
// // await xftItripApiClient.getApplyTravelDetail(2024100829442232);
// // const tripLog = await XftTripLog.importLogbyId("6702360ccc4c6f5ef98e7d02");
// // await tripLog.process();

// await new GetFbtApply().getApply();

// await processXftTripLog();
// await getTodayApply();

// const fbtApply = await FbtApply.findOne({
//   where: { id: "66d2d651d7e0722234d2fc60" },
//   relations: ["city", "user"],
// });
// if (fbtApply) await 添加xft差旅记录(fbtApply);
// // await 导入分贝通人员id();
// console.log(
//   await fbtUserApiClient.getSSOLink("wolP6zEQAAwE6_FJPB3yTnFsWWbIcsxA", "home")
// );
// const a = await xftItripApiClient.getAllCity();

// const a = await fbtApplyApiClient.getApplyOrder("66d828482a985c6c1231f5be");console.log();
// await getTodayApply();
// const a1 = new MessageHelper(["LiangZhi", ""]);
// // await 检查分贝通未导入id();
// // const a2 = await fbtOrderApiClient.getCustomFormList({
// //   approve_start_time: "2024-09-01",
// //   approve_end_time: "2024-09-05",
// // });
// const a2 = await fbtApplyApiClient.getTripDetail("XAVYCSQAT24100600001");
// await FbtApply.addApply(a2["data"]["apply"]);
// // const a3 = await fbtApplyApiClient.getTripDetail("66d580ced7e0722234ec8d9f");
// // const a4 = await fbtApplyApiClient.getTripDetail("66da3dea9870730ff375d6b5");
// console.log();
// await 导入分贝通人员id();
// console.log(await fbtUserApiClient.getSSOLink("18869965222", "home"));
// await 测试补卡记录();
// await 获取空缺请假记录();
// // XftAtdLeave.maxLeaveRecSeq().then((a) => {
// //   console.log(a);
// // });
// const rRecord = await xftatdApiClient.getLeaveRecord((1000005664).toString());
// if (rRecord["returnCode"] == "SUC0000")
//   await XftAtdLeave.addRecord(rRecord["body"]);
// const a2 = (
//   await LogAxios.find({
//     where: {
//       host: "api.cmbchina.com",
//       url: Like("%record-add%"),
//       res_data: Like("%SUC0000%"),
//     },
//   })
// ).map((a) => JSON.parse(a.payload));
// for (const a of a2) {
//   const user = a["stfNumber"];
//   const name = a["stfName"];
//   let leaders = await User.getLeaderId(user);
//   if (user == "LiangZhi") leaders = ["LiangZhi"];
//   // await new MessageHelper([user, ...leaders]).sendTextNotice({
//   //   main_title: {
//   //     title: `(已自动通过)${name}的轮休假申请`,
//   //     desc: "",
//   //   },
//   //   sub_title_text: "",
//   //   card_action: {
//   //     type: 1,
//   //     url: "https://xft.cmbchina.com/mobile-atd/#/vacation-record",
//   //   },
//   //   horizontal_content_list: [
//   //     { keyname: "请假类型", value: "轮休假" },
//   //     {
//   //       keyname: "开始时间",
//   //       value: `${a.begDate} ${a.begTime} (${getDay(a.begDate)})`,
//   //     },
//   //     {
//   //       keyname: "结束时间",
//   //       value: `${a.endDate} ${a.endTime} (${getDay(a.endDate)})`,
//   //     },
//   //   ],
//   // });
// }

// await handleMessageEvent(a);
// new MessageHelper(["LiangZhi"]).send_plain_text(
//   '<a href="https://xft.cmbchina.com/mobile-atd/#/vacation-record">请假记录</a>'
// );

//   .then(async () => {
//     // const a = await xftatdApiClient.getAllSingleDayOffQuotaLeft();
//     // console.log();
//     // await sendtoUserwithLeaveChoice();
//     // await testaaaaa();
//     // await sendtoUserwithLeaveChoiceTest();
//     // console.log(await User.getLeaderId("LuBin"));
//   })
//   .catch((e) => {
//     console.log(e);
//   });
// await importErrorAtd();
// const a = JSON.parse(
//   (await xftOAApiClient.getFormData(["FORM_253749010760794112"]))["body"][0][
//     "formData"
//   ]
// );

// const a = await xftOAApiClient.getFormData(["FORM_253749010760794112"]);
// await new BusinessTripEvent().proceedRecord(a);
// const a = await xftatdApiClient.getBusinessTripRecord({
//   staffNameOrStaffNumber: "雷登曦",
// });
// const a = await xftatdApiClient.getAllSingleDayOffQuotaLeft();
// console.log(await testLoginUrl("LiangZhi"));
// await xftUserApiClient.getEmployeeDetail("0000000263");
// await xftUserApiClient.getMapping("0000000001");
// await xftUserApiClient.getMapping("0000000263");
// await xftUserApiClient.updateMapping("0000000263", "LiuYong");
// console.log(await xftatdApiClient.getSingleDayOffQuotaLeftByUserId("XuMin"));
// console.log(process.env.FBT_NAME);
// await fbtOrderApiClient.getFormList({
//   create_start_time: "2024-08-01",
//   create_end_time: "2024-08-30",
// });
// await fbtOrderApiClient.test();
// await xftatdApiClient.getAtdType();
// await xftatdApiClient.addOvertime({
//   staffName: "杨萍丽",
//   staffNumber: "YangPingLi",
//   overtimeDate: "2024-09-02",
//   beginTime: "17:20",
//   beginTimeType: "当日",
//   endTime: "18:50",
//   endTimeType: "当日",
//   overtimeReason: "圆模加班",
// });
// for (let i = 0; i < 28; i++) {
//   await LogExpress.updateWechatEventLog();
// }
// console.log(await importErrorAtd());
// console.log(await xftUserApiClient.getEmployeeDetail("0000000263"));
// console.log(testLoginUrl("LiuYong"));

// console.log(
//   getDateRanges([
//     "2024-09-23/PM",
//     "2024-09-23/AM",
//     "2024-09-24/AM",
//     "2024-09-24/PM",
//   ])[0]
// );
// await xftOAApiClient.getForm();

// const a = await fengbeitong_token.get_token();
// console.log();
// await xftOAApiClient.getFormData(["FORM_252268610697363456"]);
// await new OvertimeEvent(
//   new XftTaskEvent(JSON.stringify(lunxiujia))
// ).getRecord();
// await sendLeave(
//   {
//     userid: "LiangZhi",
//     stfSeq: "",
//     stfName: "",
//     orgSeq: "",
//   },
//   4
// );
// let a = await xftOAApiClient.getFormData(["SALD_AAA00512_0000001846"]);
// console.log(a);
// await xftTaskCallback(JSON.stringify(lunxiujia));
// const a = new XftTaskEvent(JSON.stringify(lunxiujia));
// await a.getWxUserId();
// const b = await xftOAApiClient.operate(a.operateConfig("pass"));
// console.log(b);
// await b.getRecord();
// await b.sendNotice("LiangZhi");
// console.log(await b.passOA());
// const ab = {};
// // // // const a = await contactApiClient.getUser("LiangZhi");
// await LogExpress.updateXftEventLog();
// const a = await xftatdApiClient.getLeaveRecord("1000000027");
// const a = await xftatdApiClient.getAtdType();
// console.log(a);
// await testWechatWebhook();
// await 转正(ab["data"]);
// await importErrorAtd();
// console.log();
// // // // const a = await testWechatWebhook();

// // // console.log(a);
