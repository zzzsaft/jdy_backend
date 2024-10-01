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
  sendLeave,
  sendtoUserwithLeaveChoice,
  sendtoUserwithLeaveChoiceTest,
} from "./schedule/sendLeave";
import { decryptMsg } from "./utils/wechat/decrypt";
import { syncUser } from "./schedule/syncXftData";
import { fengbeitong_token } from "./utils/fenbeitong/token";
import { fbtOrderApiClient } from "./utils/fenbeitong/order";
import { BusinessTripEvent } from "./controllers/xft/atd/businessTrip.atd.xft.controller";
import { User } from "./entity/wechat/User";
import { testaaaaa } from "./controllers/wechat/message.wechat.controller";
// import { LogCheckin } from "./entity/common/log_checkin";
// import { xftSalaryApiClient } from "./utils/xft/xft_salary";
// import { 转正 } from "./controllers/jdy/updateUser.jdy.controller";
// PgDataSource.initialize()
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
const ddd = {
  agentid: 1000061,
  enable_duplicate_check: 1,
  duplicate_check_interval: 1800,
  touser: "YangTongLi",
  userids: ["YangTongLi"],
  msgtype: "template_card",
  template_card: {
    card_type: "button_interaction",
    main_title: { title: "贾明成发起的加班", desc: "2024-09-29" },
    sub_title_text: "",
    horizontal_content_list: [
      { keyname: "加班类型", value: "工作日" },
      { keyname: "开始时间", value: "2024-09-29 07:30" },
      { keyname: "结束时间", value: "2024-09-29 17:20" },
      { keyname: "加班时长", value: "1.5 小时" },
      { keyname: "加班原因", value: "轮休加班" },
    ],
    task_id: "a626cbce-bf0e-443c-9cd8-b58b01ad5dce",
    button_list: [
      {
        text: "驳回",
        type: 0,
        style: 3,
        key: '{"approverId":"V00KN","operateType":"reject","busKey":"OT_xft-hrm_COM_AAA00512_0000000870","taskId":"1098064973"}',
      },
      {
        text: "同意",
        type: 0,
        style: 1,
        key: '{"approverId":"V00KN","operateType":"pass","busKey":"OT_xft-hrm_COM_AAA00512_0000000870","taskId":"1098064973"}',
      },
    ],
    card_action: {
      type: 1,
      url: "https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=http%3A%2F%2Fhz.jc-times.com%3A2000%2Fxft%2Fsso%3Ftodoid%3DTD1840340212223262722&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect",
    },
  },
};
