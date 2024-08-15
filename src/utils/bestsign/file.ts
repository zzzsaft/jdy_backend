import axios, { AxiosRequestConfig } from "axios";
import { ApiClient } from "./api_client";
import FormData from "form-data";
import { logger } from "../../config/logger";

type UploadInfo = {
  url: string;
  token: string;
};
interface IPolicy {
  accessId: string;
  dir: string;
  expire: number;
  host: string;
  policy: string;
  signature: string;
}
class ContractApiClient extends ApiClient {
  private policy: IPolicy;

  private async getPolicy() {
    const data = await this.doRequest({
      method: "POST",
      path: "/gateway/rivers/api/oss/getPolicy",
    });
    if (data["code"] == 0) {
      this.policy = data["data"];
    } else {
      logger.error("获取policy失败");
    }
  }
  /**
   * 文件上传接口
   */
  async uploadFile(file, key) {
    await this.getPolicy();
    let formData = new FormData();
    formData.append("OSSAccessKeyId", this.policy.accessId);
    formData.append("policy", this.policy.policy);
    formData.append("Signature", this.policy.signature);
    formData.append(
      "Content-Disposition",
      `attachment;filename=${this.policy.dir}/${key}`
    );
    formData.append("key", `${this.policy.dir}/${key}`);
    formData.append("file", file);
    const axiosRequestConfig: AxiosRequestConfig = {
      headers: {
        content_type: "multipart/form-data",
      },
    };
    const response = await axios.post(
      this.policy.host,
      formData,
      axiosRequestConfig
    );
    // console.log(response.data);
    return `${this.policy.dir}/${key}`;
  }
}
export const fileApiClient = new ContractApiClient();
