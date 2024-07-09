import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import pkg from "sm-crypto";
import { logger } from "../../config/logger";
import { IRequestOptions } from "../../type/IType";
import { createHash } from "crypto";
import { format } from "date-fns";

class ApiClient {
  host: string;
  secret: string;

  constructor() {
    this.host = "http://121.43.124.108:9080";
    this.secret = process.env.PARKING_SECRET ?? "";
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
    const query = options.query || {};
    const timestamp = Math.floor(Date.now() / 1000);
    const httpMethod = _.toUpper(options.method);
    const queryString = query ? `?${qs.stringify(query)}` : "";
    const header = this.genHeaders(options.payload || {});
    // console.log(JSON.stringify(options.payload));
    const axiosRequestConfig = {
      method: httpMethod,
      url: `${this.host}${options.path}${queryString}`,
      data: options.payload || {},
      timeout: 10000,
      headers: header,
    };
    let response;
    try {
      // await xftLimiter.tryBeforeRun(limitOption);
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
      if (
        response.data["returnCode"] &&
        response.data["returnCode"] != "SUC0000"
      )
        logger.error(JSON.stringify(response.data));
      else logger.info(JSON.stringify(response.data).slice(0, 50));
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

  genHeaders(requestBody: any) {
    requestBody = JSON.stringify(requestBody) + this.secret;
    const sign = createHash("md5")
      .update(requestBody)
      .digest("hex")
      .toUpperCase();

    return {
      "X-TIMESTAMP": format(Date.now(), "yyyyMMddHHmmss"),
      "X-Sign": sign,
    };
  }
}
export const apiClient = new ApiClient();
