import { format } from "date-fns";
import { XftTaskEvent } from "../../controller/todo.xft.controller.js";
import { XftAtdOut } from "../../../../entity/atd/xft_out.js";
import { User } from "../../../../entity/basic/employee.js";
import { xftOAApiClient } from "../../api/xft_oa.js";
import { xftatdApiClient } from "../../api/xft_atd.js";
import { defaultWechatCorpConfig } from "../../../wechat/wechatCorps.js";
import { logger } from "../../../../config/logger.js";

const toValidDate = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
};

const firstValidDate = (...values: unknown[]) => {
  for (const value of values) {
    const date = toValidDate(value);
    if (date) return date;
  }
  return null;
};

export class OutGoingEvent {
  task: XftTaskEvent;

  remark: string;
  sponsorName: string;
  staffNbr: string;
  beginTime: string;
  endTime: string;

  location: string;
  type: string;

  constructor(task: XftTaskEvent | null = null) {
    if (!task) {
      this.task = new XftTaskEvent();
      this.task.createTime = new Date().toISOString();
    } else this.task = task;
  }

  async process() {
    await this.getRecord();
    if (this.task.dealStatus == "1") {
      await this.sendNotice(this.staffNbr);
    } else if (this.task.dealStatus == "0") {
      await this.sendCard();
    }
  }

  getRecord = async () => {
    let record;
    if (this.task.businessParam.startsWith("NFORM")) {
      record = await xftOAApiClient.getFormData([this.task.businessParam]);
      record = JSON.parse(record["body"][0]["formData"]);
      let formData = JSON.parse(record["formData"]);
      let parsedData = JSON.parse(record["parsedData"]);
      this.location = formData?.["1358473495a6"]?.label;
      this.type = formData?.["370914c10045"]?.label;
      this.sponsorName = formData?.["applyUser"][0]?.USRNAM;
      this.beginTime = formData?.["startTime"];
      this.endTime = formData?.["endTime"];
      this.remark = formData?.["remark"];
      await this.savetoDb(parsedData, formData);
    } else {
      const leaveRecSeq = this.task.businessParam.split("_").pop();
      record = await xftatdApiClient.getOutRecord(leaveRecSeq);
      Object.assign(this, record["body"]["outgoing"]);
      await XftAtdOut.addRecord(record["body"]["outgoing"]);
    }
    await this.proceedRecord(record);
  };

  savetoDb = async (parsedData, formData) => {
    const staffSeq = parsedData?.outgoingAddDto?.staffSeq;
    let user = await User.findOne({
      where: { xft_id: staffSeq },
    });
    if (!user) {
      const userId = formData?.applyUser?.[0]?.STFNBR;
      user = await User.findOne({
        where: { corp_id: defaultWechatCorpConfig.corpId, user_id: userId },
      });
      if (user && staffSeq) {
        user.xft_id = staffSeq;
        user.xft_enterprise_id = formData?.applyUser?.[0]?.USRNBR;
        await user.save();
      }
    }
    if (!user) {
      throw new Error(`用户不存在${JSON.stringify(parsedData)}`);
    }
    this.staffNbr = user.user_id;
    const outgoingAddDto = parsedData?.outgoingAddDto ?? {};
    const beginTime = firstValidDate(
      this.beginTime,
      formData?.startTime,
      formData?.beginTime,
      outgoingAddDto?.beginTime,
      outgoingAddDto?.startTime,
      outgoingAddDto?.beginDateTime
    );
    const endTime = firstValidDate(
      this.endTime,
      formData?.endTime,
      outgoingAddDto?.endTime,
      outgoingAddDto?.endDateTime
    );

    if (!beginTime || !endTime) {
      logger.error(
        `外出记录缺少有效开始/结束时间，已跳过入库。businessParam=${
          this.task.businessParam
        }, formData=${JSON.stringify({
          startTime: formData?.startTime,
          beginTime: formData?.beginTime,
          endTime: formData?.endTime,
        })}, outgoingAddDto=${JSON.stringify(outgoingAddDto)}`
      );
      return;
    }

    const out = XftAtdOut.create({
      serialNumber: this.task.businessParam,
      staffSeq,
      userId: this.staffNbr,
      name: this.sponsorName,
      departmentId: user.main_department_id,
      orgName: formData?.department[0]?.ORGNAM,
      beginTime,
      endTime,
      duration: (endTime.getTime() - beginTime.getTime()) / 1000,
      oldCteateTime: toValidDate(this.task.createTime) ?? new Date(),
      location: this.location,
      remark: this.remark,
      type: this.type,
      dataSource: parsedData?.clientFlag,
    });
    await XftAtdOut.save(out);
  };

  proceedRecord = async (record) => {
    // await XftAtdOut.addRecord(record["body"]["outgoing"]);
    this.task.horizontal_content_list = [
      {
        keyname: "申请人",
        value: this.sponsorName,
      },
    ];
    if (this.type) {
      this.task.horizontal_content_list.push(
        ...[
          {
            keyname: "出差类型",
            value: this.type,
          },
          {
            keyname: "出差地点",
            value: this.location,
          },
        ]
      );
    }
    this.task.horizontal_content_list.push(
      ...[
        {
          keyname: "出差事由",
          value: this.remark,
        },
        {
          keyname: "开始时间",
          value: this.beginTime,
        },
        {
          keyname: "结束时间",
          value: this.endTime,
        },
      ]
    );
  };

  sendNotice = async (userid: string, status = this.task.status) => {
    let userids = Array.from(new Set([userid, this.task.sendUserId]));
    await this.task.sendNotice(
      userids,
      `(${status})${this.task.title}`,
      format(new Date(this.task.createTime), "yyyy-MM-dd HH:mm")
    );
  };

  sendCard = async () => {
    await this.task.sendCard();
  };
}
