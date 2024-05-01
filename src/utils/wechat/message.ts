import { ICheckinOption } from "../../type/wechat/IOption";
import { ApiClient } from "./api_client";
import { token } from "./token";

interface Message {
  touser?: string;
  msgtype?: "text" | "textcard";
  agentid?: number;
  content?: string;
  safe?: number;
  enable_duplicate_check?: number;
  duplicate_check_interval?: number;
}

export class MessageHelper {
  request_body: Message = {
    agentid: process.env.CORP_AGENTID ? parseInt(process.env.CORP_AGENTID) : 0,
    enable_duplicate_check: 1,
    duplicate_check_interval: 1800,
  };

  constructor(userid: string[]) {
    this.request_body["touser"] = userid.join("|");
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
    await messageApiClient.sendMessage(this.request_body);
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
}
export const messageApiClient = new MessageApiClient();
