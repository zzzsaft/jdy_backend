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
import { fengbeitong_token } from "./utils/fenbeitong/token";
// import { LogCheckin } from "./entity/common/log_checkin";
// import { xftSalaryApiClient } from "./utils/xft/xft_salary";
// import { 转正 } from "./controllers/jdy/updateUser.jdy.controller";
await PgDataSource.initialize();
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

const lunxiujia = {
  appCode: "xft-bpm",
  appName: "OA审批",
  businessCode: "OA000001",
  businessName: "待审批通知",
  businessParam: "FORM_252268610697363456",
  createTime: "2024-09-21 23:02:07",
  dealStatus: "0",
  details:
    "【梁之】发起了【出差】申请，申请人：梁之，出差行程：1-2，出差日期：2024-09-21 上午 到 2024-09-21上午，出差天数：0.5，出差事由：1，请您尽快审批，发起时间：2024-09-21 23:02:07。",
  id: "TD1837507607636066305",
  processId: "1073779544",
  processStatus: "0",
  receiver: {
    enterpriseNum: "AAA00512",
    thirdpartyUserId: "",
    userName: "梁之",
    xftUserId: "U0000",
  },
  sendTime: "2024-09-21T23:02:07",
  sendUser: {
    enterpriseNum: "AAA00512",
    thirdpartyUserId: "",
    userName: "梁之",
    xftUserId: "U0000",
  },
  terminal: "0",
  title: "梁之发起的出差",
  url: {},
};
const a = await fengbeitong_token.get_token();
console.log();
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
