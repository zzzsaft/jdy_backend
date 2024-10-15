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
    '{"appCode":"xft-bpm","appName":"OA审批","businessCode":"OA000001","businessName":"待审批通知","businessParam":"FORM_255494674440257537","createTime":"2024-10-09 08:19:40","dealStatus":"1","details":"【王同钊】发起了【出差】申请，申请人：王同钊，出差行程：台州-杭州，出差日期：2024-10-09 上午 到 2024-10-11下午，出差天数：3，出差事由：浙大安装玻璃换控制器，请您尽快审批，发起时间：2024-10-09 08:19:39。","id":"TD1843808509500493826","processId":"1115028796","processStatus":"1","receiver":{"enterpriseNum":"AAA00512","thirdpartyUserId":"","userName":"斯浩","xftUserId":"V0030"},"sendTime":"2024-10-09T08:19:39","sendUser":{"enterpriseNum":"AAA00512","thirdpartyUserId":"","userName":"王同钊","xftUserId":"V003K"},"terminal":"0","title":"王同钊发起的出差","url":{}}';
  const task = new XftTaskEvent(content);
  await task.getWxUserId();
  await task.getMsgId();
  // const record = await xftOAApiClient.getFormData(["FORM_255494674440257537"]);
  await new BusinessTripEvent(task).process();
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
  const msg = {
    data: {
      _id: "670c5f1604e34125c61cada5",
      _widget_1708934717359: {},
      _widget_1708934717360: [],
      _widget_1708994681757: "2024-10-14T00:00:00.000Z",
      _widget_1709084666146: {
        _id: "5ca96e972503b18a670894ee",
        name: "晋尚崇",
        status: 1,
        type: 0,
        username: "JinShangChong",
      },
      _widget_1709084666149: {
        _id: "64b657d6bea83252bee55b22",
        dept_no: 212,
        name: "售后部",
        type: 0,
      },
      _widget_1709084666150: [],
      _widget_1709084666154: "晋尚崇",
      _widget_1709085088667: "",
      _widget_1709085088670: "温州欧三秦科技有限公司",
      _widget_1709085088671: "售后调试",
      _widget_1709085088673: "",
      _widget_1709085088674: "",
      _widget_1709085088675: "",
      _widget_1709085088676: "",
      _widget_1709112718167: "温州欧三秦科技有限公司",
      _widget_1709628384098: "",
      _widget_1709628384106: "",
      _widget_1709781056934: {},
      _widget_1719704502364: "",
      _widget_1719704502367: [
        {
          _id: "5cccf98264906b1ccb099262",
          name: "田乃根",
          status: 1,
          type: 0,
          username: "TianNaiGen",
        },
      ],
      _widget_1719799732079: "",
      _widget_1719799732080: "",
      _widget_1719799732081: "",
      _widget_1719799732082: "",
      _widget_1728656241816: "2024-10-13T16:00:00.000Z",
      _widget_1728663996210: "",
      _widget_1728663996213: "1728864000399JinShangChong",
      _widget_1728672400386: "已回公司",
      appId: "5cfef4b5de0b2278b05c8380",
      createTime: "2024-10-14T00:00:22.294Z",
      creator: {
        _id: "5c9dabe62503b18a678e0e36",
        name: "精诚时代集团",
        status: 1,
        type: 0,
        username: "#admin",
      },
      deleteTime: null,
      deleter: null,
      entryId: "65dc463c9b200f9b5e3b5851",
      flowState: 1,
      formName: "出差信息填报",
      updateTime: "2024-10-14T00:00:48.571Z",
      updater: {
        _id: "5ca96e972503b18a670894ee",
        name: "晋尚崇",
        status: 1,
        type: 0,
        username: "JinShangChong",
      },
    },
    op: "data_update",
    opTime: 1728864048571,
  };
  // const msg = JSON.parse(item.msg);
  if (msg?.op === "data_update") {
    await controllerMethod(msg);
  }
};

export const testUpdateNextBusinessTrip = async () => {
  const tripCheckin = await XftTripCheckin.findOne({ where: { id: 4792 } });
  if (tripCheckin) await updateNextBusinessTrip(tripCheckin);
};
