import axios, { AxiosRequestConfig } from "axios";
import { ApiClient } from "./api_client";
import FormData from "form-data";
import { logger } from "../../config/logger";

class ContractApiClient extends ApiClient {
  async sign(contractIds, sealName?, signer?: { enterpriseName?: string }) {
    return await this.doRequest({
      method: "POST",
      path: "/api/contracts/sign",
      payload: {
        contractIds,
        sealName,
        signer,
      },
    });
  }
  async sendApprovedContract(result: "true" | "false", contractId: string) {
    return await this.doRequest({
      method: "POST",
      path: "/api/contracts/sendApprovedContract",
      payload: {
        result,
        contractId,
      },
    });
  }
  async rejectContract(
    contractId: number,
    resignMark?: string,
    entName?: string,
    userAccount?: string
  ) {
    return await this.doRequest({
      method: "POST",
      path: `/api/contract/${contractId}/reject-signer-resign`,
      payload: {
        contractId,
        resignMark,
        entName,
        userAccount,
      },
    });
  }
}
export const contractApiClient = new ContractApiClient();
