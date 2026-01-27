import { ApiClient } from "./api_client";

class FBTReimbApiClient extends ApiClient {
  async test() {
    return await this.doRequest({
      method: "POST",
      path: "/openapi/reimb/v1/detail",
      payload: {
        page_index: 1,
        page_size: 20,
        start_time: "2025-05-27",
        end_time: "2025-05-27",
        payment_status: 1,
      },
    });
  }
  async getFormList() {
    return await this.doRequest({
      method: "POST",
      path: "/openapi/common/custom_form/v1/form_list",
      payload: {
        form_type: 8,
      },
    });
  }
  private async _getCustomFormList(
    time: {
      approve_start_time?: string;
      approve_end_time?: string;
      create_start_time?: string;
      create_end_time?: string;
    },
    page = 1
  ) {
    return await this.doRequest({
      method: "POST",
      path: "/openapi/apply/custom_common/v1/list",
      payload: {
        ...time,
        type: 24,
        page_index: page,
        page_size: 100,
        order_state: -1,
      },
    });
  }
  async getCustomFormList(time: {
    approve_start_time?: string;
    approve_end_time?: string;
    create_start_time?: string;
    create_end_time?: string;
  }) {
    let page = 1;
    let res = await this._getCustomFormList(time, page);
    let result = res.data.applies;
    while (page < res.data.total_pages) {
      page++;
      res = await this._getCustomFormList(time, page);
      result = result.concat(res.data.applies);
    }
    return result;
  }
  async getTripDetail(apply_id: string) {
    return await this.doRequest({
      method: "POST",
      path: "/openapi/apply/custom_trip/v1/detail",
      payload: {
        apply_id,
      },
    });
  }
}
export const fbtReimbApiClient = new FBTReimbApiClient();
