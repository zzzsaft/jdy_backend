import { ICheckinOption } from "../../type/wechat/IOption";
import { ApiClient } from "./api_client";
import { token_checkin } from "./token";

class MessageApiClient extends ApiClient {
  async sendMessage(options: ICheckinOption) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/message/send",
        payload: {
          ...options,
        },
        query: {
          access_token: await token_checkin.get_token(),
        },
      },
      {
        name: "sendMessage",
        duration: 1000,
        limit: 30,
      }
    );
  }
  async getCheckinData(options: ICheckinOption) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/checkin/getcheckindata",
        payload: {
          opencheckindatatype: 3,
          ...options,
        },
        query: {
          access_token: await token_checkin.get_token(),
        },
      },
      {
        name: "getcheckindata",
        duration: 1000,
        limit: 600,
      }
    );
  }
}
export const checkinApiClient = new MessageApiClient();
