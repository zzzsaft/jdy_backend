import { Request, Response } from "express";
import qs from "querystring";
import { buttonCardType, MessageHelper } from "../../utils/wechat/message";
import { User } from "../../entity/wechat/User";
import { WechatMessage } from "../../entity/wechat/message";
import { logger } from "../../config/logger";
import { v4 as uuidv4 } from "uuid";
import { LeaveEvent } from "./leave.atd.xft.controller";
import { format } from "date-fns";
import { OvertimeEvent } from "./overtime.atd.xft.controller";

export class XftTaskEvent {
  url: string;
  id: string;
  details: string;
  businessName: string;
  appName: string;
  receiver: string;
  receiverId: string;
  sendUser: string;
  sendUserId: string;
  dealStatus: string;
  processStatus: string;
  title: string;
  businessParam: string;
  processId: string;
  status: string;
  description: string;
  createTime: string;
  horizontal_content_list: {
    type?: 0 | 1 | 2 | 3;
    keyname: string;
    value?: string;
    url?: string;
    media_id?: string;
    userid?: string;
  }[];
  msgId: { msgId: string; responseCode: string };
  constructor(content = "{}") {
    Object.assign(this, JSON.parse(content));
    const redirectUrl = `http://hz.jc-times.com:2000/xft/sso?todoid=${this.id}`;
    this.url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=${qs.escape(
      redirectUrl
    )}&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect`;
    this.status =
      this.dealStatus == "2"
        ? "已撤销"
        : {
            0: "审批中",
            1: "已通过",
            2: "已否决",
            3: "已退回",
            4: "撤销",
            5: "撤回",
          }?.[this.processStatus] ?? "已处理";
    this.description = this.details;
  }
  getWxUserId = async () => {
    this.receiverId = await User.getUser_id(this.receiver["xftUserId"]);
    this.sendUserId = await User.getUser_id(this.sendUser["xftUserId"]);
  };
  getMsgId = async () => {
    const msgId = await WechatMessage.getMsgId(this.id, "xft");
    if (msgId) {
      this.msgId = msgId;
    }
  };
  operateConfig(operateType: "pass" | "reject") {
    return {
      approverId: this.receiver["xftUserId"],
      operateType: operateType,
      busKey: this.businessParam,
      taskId: this.processId,
    };
  }
  sendCard = async () => {
    const config: buttonCardType = {
      event: { eventId: this.id, eventType: "xft" as "xft" },
      sub_title_text: this.description,
      button_list: [
        {
          text: "点击处理",
          type: 1,
          style: 1,
          url: this.url,
        },
      ],
      main_title: { title: this.title, desc: this.appName },
      card_action: { type: 1, url: this.url },
    };
    if (this.horizontal_content_list) {
      config.horizontal_content_list = this.horizontal_content_list;
    }
    await new MessageHelper([this.receiverId]).sendButtonCard(config);
  };
  sendButtonCard = async (sub_title_text: string = this.description) => {
    const config: buttonCardType = {
      event: { eventId: this.id, eventType: "xft" as "xft" },
      sub_title_text,
      button_list: [
        {
          text: "驳回",
          type: 0,
          style: 3,
          key: JSON.stringify(this.operateConfig("reject")),
        },
        {
          text: "同意",
          type: 0,
          style: 1,
          key: JSON.stringify(this.operateConfig("pass")),
        },
      ],
      main_title: {
        title: this.title,
        desc: format(new Date(this.createTime), "yyyy-MM-dd"),
      },
      card_action: { type: 1, url: this.url },
    };
    if (this.horizontal_content_list) {
      config.horizontal_content_list = this.horizontal_content_list;
    }
    await new MessageHelper([this.receiverId]).sendButtonCard(config);
  };
  // sendNotice = async (
  //   userids: string[],
  //   title: string,
  //   description: string
  // ) => {
  //   await new MessageHelper(userids).send_text_card(
  //     title,
  //     description,
  //     this.url
  //   );
  // };
  sendNotice = async (
    userids: string[],
    title: string,
    desc: string,
    sub_title_text = ""
  ) => {
    const config = {
      sub_title_text,
      main_title: { title, desc },
      card_action: { type: 1 as 1, url: this.url },
      horizontal_content_list: this.horizontal_content_list,
    };
    if (this.horizontal_content_list) {
      config.horizontal_content_list = this.horizontal_content_list;
    }
    await new MessageHelper(userids).sendTextNotice(config);
  };
  disableButton = async () => {
    if (this.msgId && this.dealStatus != "0") {
      await new MessageHelper([this.receiverId]).disableButton(
        this.msgId.responseCode,
        this.status
      );
    }
  };
}

export const xftTodo = async (request: Request, response: Response) => {
  const { userinfo, userid, todoDetail } = request.body;
  await xftTaskCallback(userinfo);

  return response.send("success");
};

export const xftTaskCallback = async (content) => {
  const task = new XftTaskEvent(content);
  await task.getWxUserId();
  await task.getMsgId();
  await task.disableButton();
  if (task.details.includes("【请假】")) {
    await new LeaveEvent(task).process();
    return;
  }
  if (task.details.includes("【加班】")) {
    await new OvertimeEvent(task).process();
    return;
  }
  if (task.dealStatus == "0") {
    if (task.details.includes("【外出】") || task.details.includes("【出差】"))
      await task.sendButtonCard();
    else await task.sendCard();
  }
  if (task.processStatus != "0") {
    const noticeUsers: string[] = [task.sendUserId];
    if (task.details.includes("【定调薪审批】"))
      noticeUsers.push(...["ZhangJiaLi", "GuanBingQian"]);
    await task.sendNotice(
      noticeUsers,
      `(${task.status})${task.title}`,
      "",
      `${task.details}`
    );
  }
};
const noticeSend = {
  "【定调薪审批】": ["ZhangJiaLi", "GuanBingQian"],
};
