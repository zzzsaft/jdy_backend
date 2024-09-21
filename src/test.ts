import "./config/env";
import "./config/logger";
import { PgDataSource } from "./config/data-source";
import { testWechatWebhook } from "./controllers/wechat/wechat.controller";
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
import { LeaveEvent } from "./controllers/xft/leave.atd.xft.controller";
import { testLoginUrl } from "./controllers/xft/login.xft.controller";
import { xftUserApiClient } from "./utils/xft/xft_user";
import { testCron } from "./schedule/testCron";
import { getDateRanges, sendLeave } from "./schedule/sendLeave";
import { decryptMsg } from "./utils/wechat/decrypt";
import { OvertimeEvent } from "./controllers/xft/overtime.atd.xft.controller";
import { syncUser } from "./schedule/syncXftData";
// import { LogCheckin } from "./entity/common/log_checkin";
// import { xftSalaryApiClient } from "./utils/xft/xft_salary";
// import { 转正 } from "./controllers/jdy/updateUser.jdy.controller";
// await PgDataSource.initialize();
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
//   ])
// );
await xftOAApiClient.getForm();
const lunxiujia = {
  appCode: "xft-bpm",
  appName: "OA审批",
  businessCode: "OA000001",
  businessName: "待审批通知",
  businessParam: "OT_xft-hrm_COM_AAA00512_0000000324",
  createTime: "2024-09-15 16:56:13",
  dealStatus: "0",
  details:
    "【邓帅】发起了【加班】申请，流程类型：加班，申请人：邓帅，加班类型：工作日，起止时间：2024-09-10 17:30-2024-09-10 20:00，加班申请时长：2.50小时，加班原因：白班加班，请您尽快审批，发起时间：2024-09-15 16:56:12。",
  id: "TD1835241195759087617",
  processId: "1059868365",
  processStatus: "0",
  receiver: {
    enterpriseNum: "AAA00512",
    thirdpartyUserId: "",
    userName: "辛钊",
    xftUserId: "V005H",
  },
  sendTime: "2024-09-15T16:56:12",
  sendUser: {
    enterpriseNum: "AAA00512",
    thirdpartyUserId: "",
    userName: "邓帅",
    xftUserId: "V005P",
  },
  terminal: "0",
  title: "邓帅发起的加班",
  url: {},
};
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
