import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import { ILimitOpion, IRequestOptions } from "../../../type/IType";
import { dahua_token as token } from "./token";
import { logger } from "../../../config/logger";
import { appAxios } from "../../../utils/fileUtils";
export class ApiClient {
  private host: string = "https://www.cloud-dahua.com";

  constructor() {}

  /**
   * 发送http请求
   * @param { Object } options - 请求参数
   * @param { String } options.version - 版本
   * @param { String } options.method - HTTP动词 (GET|POST)
   * @param { String } options.path - 请求path
   * @param { Object } options.query - url参数,可选
   * @param { Object } options.payload - 请求参数,可选
   */
  protected async doRequest(options: IRequestOptions, host?: string) {
    const httpMethod = _.toUpper(options.method);
    const query = options.query ? `?${qs.stringify(options.query)}` : "";
    const axiosRequestConfig = {
      method: httpMethod,
      url: `${this.host}${options.path}${query}`,
      data: options.payload,
      timeout: 10000,
      headers: await this.genHeaders(),
    };
    let response;
    try {
      response = await axios(axiosRequestConfig);
      if (response) {
        const { status, data } = response;
        if (status && status > 200 && data.code && data.msg) {
          logger.error(
            `请求错误！Error Code: ${data.code}, Error Msg: ${data.msg},body: ${options.payload}`
          );
          throw new Error(
            `请求错误！Error Code: ${data.code}, Error Msg: ${data.msg},body: ${options.payload}`
          );
        }
      }
      return response.data;
    } catch (e) {
      console.log(e);
      response = e.response;
      if (response) {
        const { status, data } = response;
        if (status && status > 200 && data.code && data.msg) {
          throw new Error(
            `请求错误！Error Code: ${data.code}, Error Msg: ${data.msg},body: ${options.payload}`
          );
        }
      }
      throw e;
    }
  }
  private async genHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await token.get_token()}`,
      "Accept-Language": "zh-CN",
    };
  }
}
