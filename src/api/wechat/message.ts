import { WechatMessage } from "../../entity/log/log_wx_message";
import { ICheckinOption } from "../../type/wechat/IOption";
import { ApiClient } from "./api_client";
import { token } from "./token";
import { v4 as uuidv4 } from "uuid";

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
  async recall(msgid: string) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/message/recall",
        payload: {
          msgid,
        },
        query: {
          access_token: await token.get_token(),
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
