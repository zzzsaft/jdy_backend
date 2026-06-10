import axios from "axios";
import FormData from "form-data";
import { ApiClient } from "./api_client.js";
import { ILimitOpion } from "../../../type/IType.js";
import { jdyLimiter } from "../../../config/limiter.js";
import { logger } from "../../../config/logger.js";

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
    this.transaction_id = crypto.randomUUID();
    const result = await this.doRequest(
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
    this.UploadInfoList = result.token_and_url_list;
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
    let uploadResultList: any = [];
    fileList.forEach(async (file) => {
      const uploadInfo = this.UploadInfoList.pop();
      if (!uploadInfo) {
        logger.error("uploadFileList", uploadInfo);
        return;
      }
      const uploadResult = await this.uploadFile(
        uploadInfo.url,
        uploadInfo.token,
        file
      );
      uploadResultList.push(uploadResult);
    });
    return uploadResultList;
  }

  async uploadBuffer(
    app_id: string,
    entry_id: string,
    fileName: string,
    buffer: Buffer
  ) {
    const results = await this.uploadBuffers(app_id, entry_id, [
      { fileName, buffer },
    ]);
    return results[0] ?? null;
  }

  async uploadBuffers(
    app_id: string,
    entry_id: string,
    files: Array<{ fileName: string; buffer: Buffer }>
  ) {
    const uploadBufferWithInfo = async (
      uploadInfo: UploadInfo,
      fileName: string,
      buffer: Buffer
    ) => {
      const formData = new FormData();
      formData.append("token", uploadInfo.token);
      formData.append("file", buffer, { filename: fileName });
      await jdyLimiter.tryBeforeRun({
        name: "uploadFile",
        duration: 1000,
        limit: 20,
      });
      const response = await axios.post(uploadInfo.url, formData, {
        headers: formData.getHeaders(),
      });
      return response.data;
    };

    // Keep a single transaction_id for all uploads in this batch.
    await this.uploadToken(app_id, entry_id);
    const results: any[] = [];
    for (const file of files) {
      const uploadInfo = this.UploadInfoList.pop();
      if (!uploadInfo) {
        logger.error("uploadBuffers: insufficient upload tokens", {
          expected: files.length,
          uploaded: results.length,
        });
        break;
      }
      results.push(
        await uploadBufferWithInfo(uploadInfo, file.fileName, file.buffer)
      );
    }
    return results;
  }
}
export default new FileApiClient("v5");
