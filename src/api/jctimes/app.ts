import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import { logger } from "../../config/logger.js";
import { token, token_crm } from "../../features/wechat/api/token.js";
import { ApiClient } from "./api_client.js";
import {
  requestWechatProxy,
  type WechatProxyTokenType,
} from "./wechat_proxy_transport.js";

interface WechatRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  tokenType: WechatProxyTokenType;
  query?: any;
  payload?: any;
}

class JCtimesApiClient extends ApiClient {
  private wechatHost = "https://qyapi.weixin.qq.com";

  private async doWechatRequest<T = any>(
    options: WechatRequestOptions,
    getLocalAccessToken: () => Promise<string>
  ): Promise<T> {
    const accessToken = await getLocalAccessToken();
    const query =
      options.tokenType === "none"
        ? options.query
        : { ...(options.query ?? {}), access_token: accessToken };
    const proxyResult = await requestWechatProxy<T>({
      ...options,
      tokenType: "none",
      query,
    });
    if (proxyResult.ok) return proxyResult.data;

    const queryString = query ? `?${qs.stringify(query)}` : "";
    const response = await axios({
      method: _.toUpper(options.method),
      url: `${this.wechatHost}${options.path}${queryString}`,
      data: options.payload ?? {},
      timeout: 15000,
    });
    const data = response.data;
    if (data?.errcode !== undefined && data.errcode !== 0) {
      logger.error(
        `请求错误！Error Code: ${data.errcode}, Error Msg: ${data.errmsg}, path: ${options.path}`
      );
    }
    return data;
  }

  async getUserLists(): Promise<{ userid: string; department: number }[]> {
    const departmentResult = await this.doWechatRequest<{
      department?: { id: number }[];
    }>(
      {
        method: "GET",
        path: "/cgi-bin/department/list",
        tokenType: "corp",
      },
      () => token.get_token()
    );
    const departments = departmentResult.department?.length
      ? departmentResult.department
      : [{ id: 1 }];
    const userMap = new Map<string, { userid: string; department: number }>();

    for (const department of departments) {
      const result = await this.doWechatRequest<{
        userlist?: { userid: string; department: number[] }[];
      }>(
        {
          method: "GET",
          path: "/cgi-bin/user/list",
          tokenType: "corp",
          query: { department_id: department.id },
        },
        () => token.get_token()
      );

      for (const user of result.userlist ?? []) {
        if (!user.userid || userMap.has(user.userid)) continue;
        userMap.set(user.userid, {
          userid: user.userid,
          department: user.department?.[0] ?? department.id,
        });
      }
    }

    return [...userMap.values()];
  }
  async getExternalUserList() {
    return (
      await this.doWechatRequest(
        {
          method: "GET",
          path: "/cgi-bin/externalcontact/list",
          tokenType: "crm",
          query: { userid: "LiangZhi" },
        },
        () => token_crm.get_token()
      )
    )["external_userid"];
  }
  async getExternalContactDetail(external_userid, cursor) {
    const query = { external_userid };
    if (cursor) {
      query["cursor"] = cursor;
    }
    return await this.doWechatRequest(
      {
        method: "GET",
        path: "/cgi-bin/externalcontact/get",
        tokenType: "crm",
        query,
      },
      () => token_crm.get_token()
    );
  }
  async updateRemark({
    userid,
    external_userid,
    remark_company,
    remark,
    description,
  }) {
    const payload = { userid, external_userid };
    if (remark_company) {
      payload["remark_company"] = remark_company;
    }
    if (remark) {
      payload["remark"] = remark;
    }
    if (description) {
      payload["description"] = description;
    }
    return await this.doWechatRequest(
      {
        method: "POST",
        path: "/cgi-bin/externalcontact/remark",
        tokenType: "crm",
        payload,
      },
      () => token_crm.get_token()
    );
  }
  async getExternalContactDetailBatch(userid_list: string[], cursor = "") {
    const payload = {
      userid_list,
      limit: 100,
    };
    if (cursor) {
      payload["cursor"] = cursor;
    }
    return await this.doWechatRequest(
      {
        method: "POST",
        path: "/cgi-bin/externalcontact/batch/get_by_user",
        tokenType: "crm",
        payload,
      },
      () => token_crm.get_token()
    );
  }
  async getAgentTicket() {
    return await this.doWechatRequest(
      {
        method: "GET",
        path: "/cgi-bin/ticket/get",
        tokenType: "corp",
        query: { type: "agent_config" },
      },
      () => token.get_token()
    );
  }
  async getCorpTicket() {
    return await this.doWechatRequest(
      {
        method: "GET",
        path: "/cgi-bin/get_jsapi_ticket",
        tokenType: "corp",
      },
      () => token.get_token()
    );
  }

  async B2PTransfer(): Promise<{ userid: string; department: number }[]> {
    return await this.doRequest({
      method: "POST",
      path: "/boctransaction",
      payload: {
        "trn-b2e0061-rq": {
          transtype: "",
          vamflag: null,
          "b2e0061-rq": {
            insid: "",
            fractn: {
              fribkn: "",
              actacn: "",
              actnam: "",
            },
            toactn: {
              toibkn: "",
              actacn: "",
              toname: "",
              tobknm: "",
            },
            trnamt: 0,
            trncur: "CNY",
            priolv: 0,
            cuspriolv: 0,
            furinfo: "",
            trfdate: "",
            trftime: "",
          },
        },
      },
      query: {
        trnid: "",
        trncod: "",
      },
    });
  }
}
export const jctimesApiClient = new JCtimesApiClient();
