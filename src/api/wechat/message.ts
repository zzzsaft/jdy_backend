import { WechatMessage } from "../../entity/log/log_message";
import { ApiClient } from "./api_client";
import { getCorpToken } from "./token";
import { v4 as uuidv4 } from "uuid";

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
  event: { eventId: string; eventType: "jdy" | "xft" | "bestSign" | "traffic" };
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

class MessageApiClient extends ApiClient {
  private async getAccessToken(options: Message) {
    const token = getCorpToken(
      options.corpId ?? options.corpName,
      options.agentid,
      options.appName
    );
    return token.get_token();
  }

  async sendMessage(options: Message) {
    const accessToken = await this.getAccessToken(options);
    const { corpId, corpName, appName, ...payload } = options;
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/message/send",
        payload: {
          ...payload,
        },
        query: {
          access_token: accessToken,
        },
      },
      {
        name: "sendMessage",
        duration: 1000,
        limit: 30,
      }
    );
  }

  async updateMessage(options: Message) {
    const accessToken = await this.getAccessToken(options);
    const { corpId, corpName, appName, ...payload } = options;
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/message/update_template_card",
        payload: {
          ...payload,
        },
        query: {
          access_token: accessToken,
        },
      },
      {
        name: "sendMessage",
        duration: 1000,
        limit: 30,
      }
    );
  }

  async recall(msgid: string, corpId?: string, agentId?: number) {
    const accessToken = await getCorpToken(corpId, agentId).get_token();
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/message/recall",
        payload: {
          msgid,
        },
        query: {
          access_token: accessToken,
        },
      },
      {
        name: "recallMessage",
        duration: 1000,
        limit: 30,
      }
    );
  }
}
export const messageApiClient = new MessageApiClient();
