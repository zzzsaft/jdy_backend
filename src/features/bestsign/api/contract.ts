import { ApiClient } from "./api_client";

class ContractApiClient extends ApiClient {
  async SendContractByTemplate(payload: {
    templateId: string;
    sender: { enterpriseName: string; account: string };
    roles: {
      roleId: string;
      userInfo: {
        enterpriseName?: string;
        userName: string;
        userAccount: string;
      };
    }[];
    enabledDocumentIds: string[];
    textLabels: { name: string; value: string }[];
    bizNo: string;
    signTextLabels: { name: string; defaultValue: string }[];
    sendAction: "DRAFT" | "APPROVE" | "SEND";
  }) {
    return await this.doRequest({
      method: "POST",
      path: "/api/templates/send-contracts-sync-v2",
      payload,
    });
  }
  async downloadContractFiles(payload: { contractIds: string[] }) {
    return await this.doRequest({
      method: "POST",
      path: "/api/contracts/download-file",
      payload,
    });
  }
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
