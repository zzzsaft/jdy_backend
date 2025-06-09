import { IAppoint } from "../../type/IType";
import { ApiClient } from "./api_client";

class JCtimesApiClient extends ApiClient {
  async getUserLists(): Promise<{ userid: string; department: number }[]> {
    return (
      await this.doRequest({
        method: "GET",
        path: "/getAllUsers",
      })
    )["dept_user"];
  }
  async getExternalUserList() {
    return (
      await this.doRequest({
        method: "POST",
        path: "/getExternalContactList",
        payload: {
          userid: "LiangZhi",
        },
      })
    )["external_userid"];
  }
  async getExternalContactDetail(external_userid, cursor) {
    return await this.doRequest({
      method: "POST",
      path: "/getExternalContactDetail",
      payload: {
        external_userid,
        cursor,
      },
    });
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
    return await this.doRequest({
      method: "POST",
      path: "/updateRemark",
      payload,
    });
  }
  async getExternalContactDetailBatch(userid_list: string[], cursor = "") {
    const payload = {
      userid_list,
      limit: 100,
    };
    if (cursor) {
      payload["cursor"] = cursor;
    }
    return await this.doRequest({
      method: "POST",
      path: "/getExternalContactDetailBatch",
      payload,
    });
  }
  async getAgentTicket() {
    return await this.doRequest({
      method: "GET",
      path: "/agentTicket",
    });
  }
  async getCorpTicket() {
    return await this.doRequest({
      method: "GET",
      path: "/corpTicket",
    });
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
