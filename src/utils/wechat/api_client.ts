import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import { wechatLimiter } from "../../config/limiter";
import { ILimitOpion, IRequestOptions } from "../../type/IType";
import { token } from "./token";
import { logger } from "../../config/logger";
import { appAxios } from "../general";
export class ApiClient {
  host: string = "https://qyapi.weixin.qq.com";

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
  async doRequest(options: IRequestOptions, limitOption: ILimitOpion) {
    const query =
      options.query && !("access_token" in options.query)
        ? { ...options.query, access_token: await token.get_token() }
        : options.query;
    const httpMethod = _.toUpper(options.method);
    const queryString = query ? `?${qs.stringify(query)}` : "";
    const axiosRequestConfig = {
      method: httpMethod,
      url: `${this.host}${options.path}${queryString}`,
      data: options.payload,
      timeout: 10000,
    };
    let response;
    try {
      await wechatLimiter.tryBeforeRun(limitOption);
      response = await appAxios(axiosRequestConfig);
      if (response) {
        const { status, data } = response;
        if ((status && status > 200) || data["errcode"] !== 0) {
          logger.error(
            `请求错误！Error Code: ${data.errcode}, Error Msg: ${data.errmsg},body: ${options.payload}`
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
}
