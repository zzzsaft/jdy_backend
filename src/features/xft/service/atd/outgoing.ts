import { format } from "date-fns";
import { XftTaskEvent } from "../../controller/todo.xft.controller";
import { XftAtdOut } from "../../../../entity/atd/xft_out";
import { User } from "../../../../entity/basic/employee";
import { xftOAApiClient } from "../../api/xft_oa";
import { xftatdApiClient } from "../../api/xft_atd";

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
    let user = await User.findOne({
      where: { xft_id: parsedData?.outgoingAddDto?.staffSeq },
    });
    if (!user) {
      throw new Error(`用户不存在${parsedData}`);
    }
    this.staffNbr = user.user_id;
    const out = XftAtdOut.create({
      serialNumber: this.task.businessParam,
      staffSeq: parsedData?.outgoingAddDto?.staffSeq,
      userId: this.staffNbr,
      name: this.sponsorName,
      departmentId: user.main_department_id,
      orgName: formData?.department[0]?.ORGNAM,
      beginTime: new Date(this.beginTime),
      endTime: new Date(this.endTime),
      duration:
        (new Date(this.endTime).getTime() -
          new Date(this.beginTime).getTime()) /
        1000,
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
