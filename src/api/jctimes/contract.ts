import { ApiClient } from "./api_client";

class JcContractApiClient extends ApiClient {
  constructor() {
    super();
    this.host = "http://122.226.146.110:777";
  }

  async executeContract(quote: any) {
    return await this.doRequest({
      method: "POST",
      path: "/Contract/Execute",
      payload: { ...quote },
    });
  }

  async getOrder(ordernum: string) {
    return await this.doRequest({
      method: "GET",
      path: "/api/GetOrder",
      query: { ordernum },
    });
  }

  async getCustomerContacts(custid: string) {
    return await this.doRequest({
      method: "GET",
      path: "/api/GetCust",
      query: { custid },
    });
  }
}

export const jctimesContractApiClient = new JcContractApiClient();
