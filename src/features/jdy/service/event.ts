import { format } from "date-fns";
import { WechatMessage } from "../../../entity/log/log_message";
import { User } from "../../../entity/basic/employee";
import qs from "querystring";
import { JdyUtil } from "../../../utils/jdyUtils";
import {
  buttonCardType,
  MessageService,
} from "../../wechat/service/messageService";
import { workflowApiClient } from "../api/workflow";

export class JdyTaskEvent {
  url: string;
  task_id: string;
  flow_name: string;
  title: string;
  create_time: Date;
  assignee: any;
  finish_action: string;
  horizontal_content_list: {
    type?: 0 | 1 | 2 | 3;
    keyname: string;
    value?: string;
    url?: string;
    media_id?: string;
    userid?: string;
  }[];
  msgIds: WechatMessage[];
  status: number;
  static async sendMsgToWxUser(
    instance_id: string,
    horizontal_content_list?: {
      type?: 0 | 1 | 2 | 3;
      keyname: string;
      value?: string;
      url?: string;
      media_id?: string;
      userid?: string;
    }[]
  ) {
    const workflow = await workflowApiClient.workflowInstanceGet(instance_id);
    if (!workflow) return;
    for (const task of workflow["tasks"]) {
      const event = new JdyTaskEvent(task);
      if (horizontal_content_list) {
        event.horizontal_content_list = horizontal_content_list;
      }
      await event.getMsgId();
      await event.disableButton();
      if (!event.msgIds && (event.status == 0 || event.status == 4))
        await event.sendCard();
    }
  }
  private constructor(task) {
    Object.assign(this, task);
    const redirectUrl = task.url;
    this.url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=${qs.escape(
      redirectUrl
    )}&response_type= code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect`;
    this.create_time = new Date(this.create_time);
    this.assignee = JdyUtil.getUser(task.assignee)?.username;

    this.finish_action =
      {
        auto_approve: "去重审批",
        forward: "提交",
        back: "回退",
        close: "关闭",
        transfer: "转交",
        batch_forward: "批量提交",
        sign_after: "后加签",
      }?.[this.finish_action] ?? "";
  }
  getMsgId = async () => {
    const msgId = await MessageService.getMsgId(this.task_id, "jdy");
    if (msgId) {
      this.msgIds = msgId;
    }
  };
  sendCard = async () => {
    const config: buttonCardType = {
      event: { eventId: this.task_id, eventType: "jdy" as "jdy" },
      sub_title_text: "",
      button_list: [
        {
          text: "点击处理",
          type: 1,
          style: 1,
          url: this.url,
        },
      ],
      main_title: {
        title: this.title,
        desc: format(this.create_time, "yyyy-MM-dd HH:mm"),
      },
      card_action: { type: 1, url: this.url },
    };
    if (this.horizontal_content_list) {
      config.horizontal_content_list = this.horizontal_content_list;
    }
    await new MessageService([this.assignee]).sendButtonCard(config);
  };
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
    await new MessageService(userids).sendTextNotice(config);
  };
  disableButton = async () => {
    for (const msgId of this.msgIds) {
      if (msgId && this.status != 0 && this.status != 4) {
        await new MessageService([this.assignee]).disableButton(
          msgId,
          this.finish_action
        );
      }
    }
  };
}
