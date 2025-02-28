import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import pkg from "sm-crypto";
import { logger } from "../../config/logger";
import { IRequestOptions } from "../../type/IType";
import { createHash } from "crypto";
import { format } from "date-fns-tz";
import { toZonedTime, format as formatTz } from "date-fns-tz";
import { appAxios } from "../../utils/fileUtils";

export class ApiClient {
  host: string;
  secret: string;

  constructor() {
    this.host = "http://open.api.tianyancha.com/services/open";
    this.secret = process.env.TIANYANCHA ?? "";
  }

  /**
   * 发送http请求
   * @param { Object } options - 请求参数
   * @param { String } options.method - HTTP动词 (GET|POST)
   * @param { String } options.path - 请求path
   * @param { Object } options.query - url参数,可选
   * @param { Object } options.payload - 请求参数,可选
   */
  async doRequest(options: IRequestOptions) {
    const query = options.query;
    const httpMethod = _.toUpper(options.method);
    const queryString = query ? `?${qs.stringify(query)}` : "";
    const header = { Authorization: this.secret };
    // console.log(JSON.stringify(options.payload));
    const axiosRequestConfig = {
      method: httpMethod,
      url: `${this.host}${options.path}${queryString}`,
      data: options.payload || null,
      timeout: 10000,
      headers: header,
    };
    let response;
    try {
      response = await appAxios(axiosRequestConfig);
      if (response) {
        const { status, data } = response;
        if (status && status > 200) {
          logger.error(
            `请求错误！Error Code: ${data.code}, Error Msg: ${
              data.reason
            },body: ${JSON.stringify(options.payload)}`
          );
          throw new Error(
            `请求错误！Error Code: ${data.code}, Error Msg: ${data.reason},body: ${options.payload}`
          );
        }
      }
      return response.data;
    } catch (e) {
      logger.error(e);
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
}
