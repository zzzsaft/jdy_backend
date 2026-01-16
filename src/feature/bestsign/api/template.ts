import axios, { AxiosRequestConfig } from "axios";
import { ApiClient } from "./api_client";
import FormData from "form-data";
import { logger } from "../../../config/logger";

class TemplateApiClient extends ApiClient {
  async SendContractByTemplate(
    templateId,
    senderAccount,
    senderEntName,
    roles,
    textLabels,
    documents,
    sendAction,
    signTextLabels,
    bizNo
  ) {
    return await this.doRequest({
      method: "POST",
      path: "/api/templates/send-contracts-sync-v2",
      payload: {
        sender: {
          account: senderAccount,
          enterpriseName: senderEntName,
        },
        templateId: templateId,
        roles: roles,
        documents: documents,
        textLabels: textLabels,
        sendAction: sendAction,
        signTextLabels: signTextLabels,
        bizNo: bizNo,
      },
    });
  }
  async getTemplates(enterpriseName?, account?) {
    return await this.doRequest({
      method: "GET",
      path: "/api/templates/v2",
      query: { enterpriseName, account },
    });
  }
}
export const templatesApiClient = new TemplateApiClient();
