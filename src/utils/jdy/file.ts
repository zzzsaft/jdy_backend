import axios from "axios";
import { ILimitOpion } from "../../type/IType";
import { ApiClient } from "./api_client";
import { uniqueId } from "lodash";
import { jdyLimiter } from "../../config/limiter";

const FORM_BASE_PATH = "app/entry/";

type UploadInfo = {
  url: string;
  token: string;
};

class FileApiClient extends ApiClient {
  validVersions = ["v5"];
  defaultVersion = "v5";
  UploadInfoList: UploadInfo[] = [];
  transaction_id: string;
  /**
   * check version
   */
  async doRequest(options, limitOption: ILimitOpion) {
    if (!this.validVersions.includes(this.version)) {
      this.version = this.defaultVersion;
    }
    return super.doRequest(options, limitOption);
  }

  /**
   * 获取文件上传凭证和上传地址接口
   */
  async uploadToken(app_id, entry_id) {
    this.transaction_id = uniqueId();
    this.UploadInfoList = await this.doRequest(
      {
        method: "POST",
        path: FORM_BASE_PATH + "file/get_upload_token",
        payload: {
          transaction_id: this.transaction_id,
          app_id: app_id,
          entry_id: entry_id,
        },
      },
      {
        name: "uploadToken",
        duration: 1000,
        limit: 20,
      }
    );
  }
  /**
   * 文件上传接口
   */
  private async uploadFile(url, token, file) {
    let formData = new FormData();
    formData.append("token", token);
    formData.append("file", file);
    const axiosRequestConfig = {
      method: "POST",
      url,
      data: formData,
    };
    await jdyLimiter.tryBeforeRun({
      name: "uploadFile",
      duration: 1000,
      limit: 20,
    });
    const response = await axios(axiosRequestConfig);
    return response.data;
  }

  async uploadFileList(fileList: File[]) {
    let uploadResultList = [];
    fileList.forEach(async (file) => {
      const uploadInfo = this.UploadInfoList.pop();
      const uploadResult = await this.uploadFile(
        uploadInfo.url,
        uploadInfo.token,
        file
      );
      uploadResultList.push(uploadResult);
    });
    return uploadResultList;
  }
}
export default new FileApiClient("v5");
