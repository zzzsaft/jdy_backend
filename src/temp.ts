import _ from "lodash";
import { XftAtdLeave } from "./entity/atd/xft_leave";
import { xftatdApiClient } from "./api/xft/xft_atd";
import { sleep } from "./config/limiter";
import { XftTaskEvent } from "./controllers/xft/todo.xft.controller";
import { ReissueEvent } from "./controllers/xft/atd/reissue.atd.xft.controller";
import { fbtUserApiClient } from "./api/fenbeitong/user";
import { User } from "./entity/basic/employee";
import { Between, IsNull, Like, Not } from "typeorm";
import { XftCity } from "./entity/util/xft_city";
import { FbtApply } from "./entity/atd/fbt_trip_apply";
import { XftTripLog } from "./schedule/getFbtApply";
import { BusinessTrip } from "./entity/atd/businessTrip";
import { xftOAApiClient } from "./api/xft/xft_oa";
import { BusinessTripEvent } from "./controllers/xft/atd/businessTrip.atd.xft.controller";
import { controllerMethod } from "./controllers/jdy/data.jdy.controller";
import { LogExpress } from "./entity/log/log_express";
import { XftTripCheckin } from "./entity/atd/business_trip_checkin";
import { updateNextBusinessTrip } from "./services/jdy/businessTripCheckinServices";
export const 获取空缺请假记录 = async () => {
  const leaveRecSeqs = await XftAtdLeave.createQueryBuilder("leave")
    .select("leave.leaveRecSeq")
    .orderBy("leave.leaveRecSeq", "ASC")
    .getRawMany();

  // 提取 leaveRecSeq 数字
  const leaveRecSeqArray = leaveRecSeqs.map((item) =>
    parseInt(item.leave_leaveRecSeq)
  );

  const minSeq = _.min(leaveRecSeqArray) || 1000000000; // 获取最小值，或者指定起始值
  const maxSeq = _.max(leaveRecSeqArray) || 1000000000; // 获取最大值

  // 创建一个完整的范围数组
  const fullRange = _.range(1000005600, 1000005684 + 1);

  // 找出缺失的数字
  const missingLeaveRecSeqs = _.difference(fullRange, leaveRecSeqArray);
  for (const i of missingLeaveRecSeqs) {
    const rRecord = await xftatdApiClient.getLeaveRecord(i.toString());
    if (rRecord["returnCode"] == "SUC0000")
      await XftAtdLeave.addRecord(rRecord["body"]);
    await sleep(10);
  }
  console.log(missingLeaveRecSeqs);
};

export const 测试补卡记录 = async () => {
  const record = {
    appCode: "xft-bpm",
    appName: "OA审批",
    businessCode: "OA000001",
    businessName: "待审批通知",
    businessParam: "MUC_xft-hrm_COM_AAA00512_0000000131",
    createTime: "2024-10-06 13:29:51",
    dealStatus: "0",
    details:
      "【杨兴旺】发起了【补卡】申请，流程类型：补卡，申请人：杨兴旺，申请时间：2024-10-05 20:00:00，班次信息：精一生产人员白班:08:00-16:50，补卡原因：补卡，请您尽快审批，发起时间：2024-10-06 13:29:50。",
    id: "TD1842799406589648897",
    processId: "1108765946",
    processStatus: "0",
    receiver: {
      enterpriseNum: "AAA00512",
      thirdpartyUserId: "",
      userName: "辛钊",
      xftUserId: "U0000",
    },
    sendTime: "2024-10-06T13:29:50",
    sendUser: {
      enterpriseNum: "AAA00512",
      thirdpartyUserId: "",
      userName: "杨兴旺",
      xftUserId: "U0000",
    },
    terminal: "0",
    title: "杨兴旺发起的补卡",
    url: {},
  };
  const task = new XftTaskEvent(JSON.stringify(record));
  await task.getWxUserId();
  await task.getMsgId();
  await new ReissueEvent(task).process();
};

export const 导入分贝通人员id = async () => {
  const users = await fbtUserApiClient.getUserList();
  for (const user of users) {
    await User.update(
      {
        fbtPhone: user["phone"],
      },
      { fbtThirdId: user["third_id"] }
    );
  }
};
export const 检查分贝通未导入id = async () => {
  const users = await fbtUserApiClient.getUserList();
  const userdb = (
    await User.find({ where: { fbtId: Not(IsNull()) }, select: ["fbtId"] })
  ).map((user) => user.fbtId);
  const result = _.differenceWith(
    users,
    userdb,
    (user: any, fbtId) => user.id === fbtId
  );
};

export const processXftTripLog = async () => {
  const fbtApplies = await FbtApply.find({
    where: {
      start_time: Between(new Date("2024-04-01"), new Date("2024-4-31")),
      state: 4,
    },
    order: { proposerUserId: "ASC", start_time: "ASC" },
    relations: ["city", "user"],
  });
  for (const fbtApply of fbtApplies) {
    const tripLog = XftTripLog.importLogbyApply(fbtApply);
    await tripLog.process();
  }
};

export const processPrecisionIssueData = async () => {
  const logTrip = await BusinessTrip.createQueryBuilder("log_trip_sync")
    .where("EXTRACT(HOUR FROM log_trip_sync.start_time) BETWEEN 11 AND 13")
    .andWhere({ xftBillId: Not(IsNull()) })
    .getMany();
  for (const log of logTrip) {
    const apply = await FbtApply.findOne({
      where: { id: log.fbtCurrentId },
      relations: ["city"],
    });
    if (!apply) continue;
    await XftTripLog.修改xft差旅记录(apply, log);
  }
};

export const logTripSyncByid = async (id: string) => {
  const tripLog = await XftTripLog.importLogbyId(id);
  await tripLog.process();
};

export const testXftTrip = async () => {
  const content =
    '{"appCode":"xft-bpm","appName":"OA审批","businessCode":"OA000001","businessName":"待审批通知","businessParam":"SALD_AAA00512_0000002148","createTime":"2024-10-16 18:59:35","dealStatus":"0","details":"【黄鸾凤】发起了【定调薪审批】申请，总笔数：1，调薪笔数：1，请您尽快审批，发起时间：2024-10-16 18:59:33。","id":"TD1846506264160186369","processId":"1138573852","processStatus":"0","receiver":{"enterpriseNum":"AAA00512","thirdpartyUserId":"","userName":"蔡小勇","xftUserId":"V002P"},"sendTime":"2024-10-16T18:59:33","sendUser":{"enterpriseNum":"AAA00512","thirdpartyUserId":"","userName":"黄鸾凤","xftUserId":"V01WO"},"terminal":"0","title":"黄鸾凤发起的定调薪审批","url":{}}';
  const task = new XftTaskEvent(content);
  await task.getWxUserId();
  await task.getMsgId();
  await task.sendCard();
  // const record = await xftOAApiClient.getFormData(["FORM_255494674440257537"]);
  // await new BusinessTripEvent(task).process();
};

export const testJdyCreateTripCheckin = async () => {
  const a = await LogExpress.find({
    where: { path: "/jdy/data", msg: Like("%65dc463c9b200f9b5e3b5851%") },
  });
  for (const item of a) {
    const msg = JSON.parse(item.msg);
    if (msg?.op === "data_update") {
      await controllerMethod(msg);
    }
  }
};

export const testJdyCreateTripCheckinSingle = async () => {
  const msg = null;
  // const msg = JSON.parse(item.msg);
  // if (msg?.op === "data_update") {
  //   await controllerMethod(msg);
  // }
};

export const testUpdateNextBusinessTrip = async () => {
  const tripCheckin = await XftTripCheckin.findOne({ where: { id: 4792 } });
  if (tripCheckin) await updateNextBusinessTrip(tripCheckin);
};
