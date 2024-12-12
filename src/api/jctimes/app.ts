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
