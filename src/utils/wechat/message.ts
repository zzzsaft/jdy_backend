import { WechatMessage } from "../../entity/wechat/message";
import { ICheckinOption } from "../../type/wechat/IOption";
import { ApiClient } from "./api_client";
import { token } from "./token";
import { v4 as uuidv4 } from "uuid";

interface Message {
  touser?: string;
  msgtype?: "text" | "textcard" | "template_card";
  agentid?: number;
  content?: string;
  safe?: number;
  enable_duplicate_check?: number;
  duplicate_check_interval?: number;
}

export type buttonCardType = {
  event: { eventId: string; eventType: "jdy" | "xft" | "bestSign" };
  main_title: { title: string; desc: string };
  sub_title_text: string;
  button_list: {
    text: string;
    type?: 0 | 1; //按钮点击事件类型，0 或不填代表回调点击事件，1 代表跳转url
    style?: 1 | 2 | 3 | 4;
    key?: string; //type是0时必填
    url?: string; //type是1时必填
  }[];
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
};

export class MessageHelper {
  request_body: Message = {
    agentid: process.env.CORP_AGENTID ? parseInt(process.env.CORP_AGENTID) : 0,
    enable_duplicate_check: 1,
    duplicate_check_interval: 1800,
  };

  constructor(userid: string[]) {
    this.request_body["touser"] = userid.join("|");
    this.request_body["userids"] = userid;
  }

  async send_plain_text(text: string, enable_id_trans = false) {
    this.request_body["msgtype"] = "text";
    this.request_body["enable_id_trans"] = enable_id_trans ? 1 : 0;
    this.request_body["text"] = {
      content: text,
    };
    return await messageApiClient.sendMessage(this.request_body);
  }

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
    return await messageApiClient.sendMessage(this.request_body);
  }

  async sendButtonCard(config: buttonCardType) {
    const {
      main_title,
      sub_title_text,
      horizontal_content_list,
      button_list,
      card_action,
      event,
    } = config;
    const taskid = uuidv4();
    this.request_body["msgtype"] = "template_card";
    this.request_body["card_type"] = "button_interaction";
    this.request_body["template_card"] = {
      card_type: "button_interaction",
      main_title,
      sub_title_text,
      horizontal_content_list,
      task_id: taskid,
      button_list,
      card_action,
    };
    const msg = await messageApiClient.sendMessage(this.request_body);
    if (msg["errcode"] == 0)
      await WechatMessage.addMsgId(
        msg["msgid"],
        msg["response_code"],
        event.eventId,
        event.eventType,
        taskid
      );
  }
  async disableButton(response_code, replace_name) {
    this.request_body["response_code"] = response_code;
    this.request_body["button"] = {
      replace_name: replace_name,
    };
    await messageApiClient.updateMessage(this.request_body);
  }
}

class MessageApiClient extends ApiClient {
  async sendMessage(options) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/message/send",
        payload: {
          ...options,
        },
        query: {
          access_token: await token.get_token(),
        },
      },
      {
        name: "sendMessage",
        duration: 1000,
        limit: 30,
      }
    );
  }
  async updateMessage(options) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/message/update_template_card",
        payload: {
          ...options,
        },
        query: {
          access_token: await token.get_token(),
        },
      },
      {
        name: "sendMessage",
        duration: 1000,
        limit: 30,
      }
    );
  }
}
export const messageApiClient = new MessageApiClient();
