import { v4 as uuidv4 } from "uuid";
import { WechatMessage } from "../../../entity/log/log_message";
import { messageApiClient } from "../api/message";

interface Message {
  touser?: string;
  msgtype?: "text" | "textcard" | "template_card";
  agentid?: number;
  content?: string;
  corpId?: string;
  corpName?: string;
  appName?: string;
  safe?: number;
  enable_duplicate_check?: number;
  duplicate_check_interval?: number;
}
const responseCode: string[] = [];

type templateCardType = {
  main_title: { title: string; desc: string };
  sub_title_text: string;
  horizontal_content_list?: {
    type?: 0 | 1 | 2 | 3; //链接类型，0或不填代表不是链接，1 代表跳转url，2 代表下载附件，3 代表点击跳转成员详情,
    keyname: string;
    value?: string;
    url?: string;
    media_id?: string;
    userid?: string;
  }[];
  card_action?: {
    type: 0 | 1;
    url: string;
  };
  quote_area?: any;
};

export type buttonCardType = templateCardType & {
  event: {
    eventId: string;
    eventType: "jdy" | "xft" | "bestSign" | "traffic" | "checkin";
  };
  button_list: {
    text: string;
    type?: 0 | 1; //按钮点击事件类型，0 或不填代表回调点击事件，1 代表跳转url
    style?: 1 | 2 | 3 | 4;
    key?: string; //type是0时必填
    url?: string; //type是1时必填
  }[];
  button_selection?: any;
};
export type voteInteractionCardType = {
  main_title: { title: string; desc: string };
  event: { eventId: string; eventType: "jdy" | "xft" | "bestSign" | "general" };
  checkbox: {
    question_key: string;
    mode: 0 | 1;
    option_list: { id: string; text: string; is_checked: boolean }[];
  };
  submit_button: {
    text: string;
    key: string;
  };
};

export class MessageService {
  request_body: Message = {
    agentid: process.env.CORP_AGENTID ? parseInt(process.env.CORP_AGENTID) : 0,
    enable_duplicate_check: 1,
    duplicate_check_interval: 1800,
  };
  source: "hr" | "jdy" = "hr";
  private corpKey?: string;
  private appName?: string;

  constructor(
    userid: string[],
    source: "hr" | "jdy" = "hr",
    corpId?: string,
    appName?: string
  ) {
    this.request_body["touser"] = userid.filter((id) => id).join("|");
    this.request_body["userids"] = userid.filter((id) => id);
    this.source = source;
    this.corpKey = corpId ?? process.env.CORP_ID ?? undefined;
    this.appName = appName;
    if (source == "jdy") {
      this.request_body.agentid = parseInt(process.env.CORP_AGENTID_CRM ?? "");
      this.corpKey = process.env.CORP_ID ?? corpId ?? this.corpKey;
      this.appName = process.env.WECHAT_APP_CRM ?? this.appName;
    }
  }

  send_plain_text = async (text, enable_id_trans = false) => {
    this.request_body["msgtype"] = "text";
    this.request_body["enable_id_trans"] = enable_id_trans ? 1 : 0;
    this.request_body["text"] = {
      content: text,
    };
    await this.sendMessage();
  };

  async send_text_card(
    title: string,
    description: string,
    url: string,
    btntxt: string = "更多"
  ) {
    this.request_body["msgtype"] = "textcard";
    this.request_body["textcard"] = {
      title: title,
      description: description,
      url: url,
      btntxt: btntxt,
    };
    await this.sendMessage();
  }

  async sendButtonCard(config: buttonCardType) {
    const {
      main_title,
      sub_title_text,
      horizontal_content_list,
      button_list,
      card_action,
      event,
      button_selection,
    } = config;
    const taskid = uuidv4();
    this.request_body["msgtype"] = "template_card";
    this.request_body["template_card"] = {
      card_type: "button_interaction",
      main_title,
      sub_title_text,
      horizontal_content_list,
      task_id: taskid,
      button_list,
      card_action,
      button_selection,
    };
    await this.sendMessage(event.eventId, event.eventType, taskid);
  }

  async sendTextNotice(config: templateCardType) {
    const {
      main_title,
      sub_title_text,
      horizontal_content_list,
      card_action,
      quote_area,
    } = config;
    const taskid = uuidv4();
    this.request_body["msgtype"] = "template_card";
    this.request_body["template_card"] = {
      card_type: "text_notice",
      main_title,
      sub_title_text,
      horizontal_content_list,
      task_id: taskid,
      card_action,
      quote_area,
    };
    await this.sendMessage();
  }
  async sendVoteInteraction(config: voteInteractionCardType) {
    const { main_title, checkbox, submit_button, event } = config;
    const taskid = uuidv4();
    this.request_body["msgtype"] = "template_card";
    this.request_body["template_card"] = {
      card_type: "vote_interaction",
      main_title,
      task_id: taskid,
      checkbox,
      submit_button,
    };
    await this.sendMessage(event.eventId, event.eventType, taskid);
  }

  async disableButton(_log: WechatMessage, replace_name) {
    const log = await WechatMessage.findOne({ where: { msgId: _log.msgId } });
    if (!log) return;
    if (
      log.userid &&
      log.userid?.length != 0 &&
      !log.userid?.some((item) => this.request_body["userids"].includes(item))
    )
      return;
    if (responseCode.includes(log.responseCode)) return;
    responseCode.push(log.responseCode);

    this.request_body["response_code"] = log.responseCode;
    this.request_body["button"] = {
      replace_name: replace_name,
    };
    await messageApiClient.updateMessage({
      ...this.request_body,
      corpId: this.corpKey,
      appName: this.appName,
    });
    log.disabled = true;
    await log.save();
  }

  private sendMessage = async (
    eventId = "",
    eventType:
      | "jdy"
      | "xft"
      | "bestSign"
      | "general"
      | "traffic"
      | "checkin" = "general",
    taskid = ""
  ) => {
    const msg = await messageApiClient.sendMessage({
      ...this.request_body,
      corpId: this.corpKey,
      appName: this.appName,
    });
    if (msg["errcode"] == 0)
      await MessageService.addMsgId(
        msg["msgid"],
        msg?.["response_code"],
        eventId,
        eventType,
        taskid,
        JSON.stringify(this.request_body),
        this.request_body["userids"]
      );
  };
  static addMsgId = async (
    msgId: string,
    responseCode: string,
    eventId: string,
    eventType: string,
    taskId: string,
    content: string,
    userid: string[]
  ) => {
    const msg = WechatMessage.create({
      msgId,
      responseCode,
      eventId,
      eventType,
      taskId,
      disabled: false,
      content,
      userid,
    });
    await msg.save();
  };
  static getMsgId = async (eventId, eventType) => {
    const msg = await WechatMessage.createQueryBuilder("msg")
      .where("msg.event_id = :eventId", {
        eventId,
      })
      .andWhere("msg.event_type = :eventType", {
        eventType,
      })
      .orderBy("msg.created_at", "DESC")
      .getMany();
    if (msg) {
      return msg;
    }
    return null;
  };
  static updateResponseCode = async (taskId: string, responseCode: string) => {
    const msg = await WechatMessage.findOne({ where: { taskId: taskId } });
    if (msg) {
      msg.responseCode = responseCode;
      await msg.save();
    }
  };
}
