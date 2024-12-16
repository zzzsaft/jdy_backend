import _ from "lodash";
import { XftAtdLeave } from "./entity/atd/xft_leave";
import { xftatdApiClient } from "./api/xft/xft_atd";
import { sleep } from "./config/limiter";
import { XftTaskEvent } from "./controllers/xft/todo.xft.controller";
import { fbtUserApiClient } from "./api/fenbeitong/user";
import { User } from "./entity/basic/employee";
import {
  And,
  Between,
  IsNull,
  Like,
  MoreThan,
  MoreThanOrEqual,
  Not,
} from "typeorm";
import { XftCity } from "./entity/util/xft_city";
import { FbtApply } from "./entity/atd/fbt_trip_apply";
import { XftTripLog } from "./schedule/getFbtApply";
import { BusinessTrip } from "./entity/atd/businessTrip";
import { xftOAApiClient } from "./api/xft/xft_oa";
import { controllerMethod } from "./controllers/jdy/data.jdy.controller";
import { LogExpress } from "./entity/log/log_express";
import { XftTripCheckin } from "./entity/atd/business_trip_checkin";
import {
  businessTripCheckinServices,
  updateNextBusinessTrip,
} from "./services/jdy/businessTripCheckinServices";
import { XftAtdOvertime } from "./entity/atd/xft_overtime";
import { personApiClient } from "./api/dahua/person";
import { EntryExistRecords } from "./entity/parking/dh_entry_exit_record";
import { ReissueEvent } from "./services/xft/atd/reissue.atd.xft.controller";
import { OutGoingEvent } from "./services/xft/atd/outgoing";
import { XftAtdOut } from "./entity/atd/xft_out";
import { JdyRestOvertime } from "./entity/atd/jdy_rest_overtime";
import { restOvertimeServices } from "./services/jdy/restOvertimeServices";
import convert from "xml-js";
import { OvertimeEvent } from "./services/xft/atd/overtime.atd.xft.controller";
export const 获取空缺请假记录 = async () => {
  // const leaveRecSeqs = await XftAtdLeave.createQueryBuilder("leave")
  //   .select("leave.leaveRecSeq")
  //   .orderBy("leave.leaveRecSeq", "ASC")
  //   .getRawMany();

  // // 提取 leaveRecSeq 数字
  // const leaveRecSeqArray = leaveRecSeqs.map((item) =>
  //   parseInt(item.leave_leaveRecSeq)
  // );

  // const minSeq = _.min(leaveRecSeqArray) || 1000000000; // 获取最小值，或者指定起始值
  // const maxSeq = _.max(leaveRecSeqArray) || 1000000000; // 获取最大值

  // 创建一个完整的范围数组
  // const fullRange = _.range(3703, 3880);
  const fullRange = _.range(10, 99);

  // 找出缺失的数字
  // const missingLeaveRecSeqs = _.difference(fullRange, leaveRecSeqArray);
  for (const i of fullRange) {
    const rRecord = await xftatdApiClient.getOutRecord(`00000000${i}`);
    if (rRecord["returnCode"] == "SUC0000")
      await XftAtdOut.addRecord(rRecord["body"]["outgoing"]);
    await sleep(10);
  }
  console.log(fullRange);
};

export const 测试补卡记录 = async () => {
  const logs = await LogExpress.find({
    where: {
      path: "/xft/event",
      content: And(Like("%【外出】申请%"), Like('%"dealStatus":"1"%')),
    },
  });
  for (const item of logs) {
    const task = new XftTaskEvent(item.content);
    await task.getWxUserId();
    await task.getMsgId();
    await new OutGoingEvent(task).process();
  }
};
export const testXftEvent = async () => {
  const logs = await LogExpress.find({
    where: {
      path: "/xft/event",
      content: Like("%hrm_COM_AAA00512_0000007349%"),
    },
  });
  for (const item of logs) {
    const task = new XftTaskEvent(item.content);
    await task.getWxUserId();
    await task.getMsgId();
    await new OvertimeEvent(task).process();
  }
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

export const testChangeShift = async () => {
  await xftOAApiClient.trial({
    starterId: "U0000",
    busData: {
      value: {
        "adtShift-BGNDATE:": "2024-10-23",
        "adtShift-NRDSEQ": "0000000004",
        "adtShift-ORDSEQ": "0000000005",
        // ATTZBQRYY: [
        //   {
        //     STFNAM: "梁之",
        //     STFSEQ: "0000000001",
        //     STFNBR: "LiangZhi",
        //     BGNDATE: "2024-10-23",
        //     ORDSEQ: "0000000005",
        //     NRDSEQ: "-1",
        //     REMARK: "1",
        //     ORDNAM: "【精诚-冬令时打卡规则】 07:30-当日16:40",
        //     DATTYP: "0",
        //     NRDNAM: "休息",
        //     SMTCHN: "0",
        //   },
        // ],
      },
      // mappings: [],
    },
    procKey: "FORM_11695218202410221334159741",
  });
};

export const createBTcheckin = async () => {
  const data = await LogExpress.find({
    where: {
      path: "/jdy/data",
      msg: And(Like("%出差信息填报%")),
      created_at: MoreThanOrEqual(new Date("2024-11-03")),
    },
  });
  for (const item of data) {
    const msg = JSON.parse(item.msg);
    if (msg?.op === "data_update") {
      await businessTripCheckinServices.dataUpdate(msg["data"]);
    }
  }
};
export const 授权大华人员 = async () => {
  const users = await User.find({
    where: { dahua_id: Not(IsNull()), is_employed: false },
  });
  for (const user of users) {
    await personApiClient.authAsync(user.dahua_id, []);
  }
};
export const 修复停车记录 = async () => {
  const log = await LogExpress.find({
    where: { path: "/parking/v2", msg: Like("%1854067794543378432_0001%") },
  });
  for (const item of log) {
    const msg = JSON.parse(item.msg);
    if (msg?.parkingRecordId) {
      const record = await EntryExistRecords.findOne({
        where: { recordId: msg.parkingRecordId },
      });
      if (record) {
        record.location = "澄江分厂";
        record.save();
      }
    }
  }
};
export const 导入加班记录 = async () => {
  const a = await JdyRestOvertime.find({
    where: {
      startTime: MoreThan(new Date("2024-10-31")),
      serialNumber: IsNull(),
    },
  });
  for (const i of a) await restOvertimeServices.addToXft(i);
};
export const 导入外出打卡记录 = async () => {
  const a = await XftTripCheckin.find({
    where: {
      checkinDate: Between(new Date("2024-11-01"), new Date("2024-11-30")),
    },
  });
  const result: any = [];
  for (const i of a) {
    const record = await businessTripCheckinServices.generateXftCheckinRecord(
      i
    );
    if (record) result.push(record);
  }
  await xftatdApiClient.addOutData(result);
};
