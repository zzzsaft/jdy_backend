import { ApiClient } from "./api_client";
import { token } from "./token";

class ApprovalApiClient extends ApiClient {
  async getApprovalDetail(sp_no: string) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/oa/getapprovaldetail",
        payload: {
          sp_no,
        },
        query: {
          access_token: await token.get_token(),
        },
      },
      {
        name: "getApprovalDetail",
        duration: 60000,
        limit: 600,
      }
    );
  }
  async getApprovalList(req: { starttime; endtime; new_cursor; size }) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/oa/getapprovalinfo",
        payload: {
          ...req,
          filters: [
            {
              key: "template_id",
              value: "3Tka9Us1v5Zc8RGch3HFaRJx2ihvg8r3qaK137Gj",
            },
          ],
          // filters: [{ key: "record_type", value: "4" }],
        },
        query: {
          access_token: await token.get_token(),
        },
      },
      {
        name: "getApprovalDetail",
        duration: 60000,
        limit: 600,
      }
    );
  }
}
export const approvalApiClient = new ApprovalApiClient();
