import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import { token } from "./token.js";
import { ILimitOpion, IRequestOptions } from "../../../type/IType.js";
import { wechatLimiter } from "../../../config/limiter.js";
import { appAxios } from "../../../utils/fileUtils.js";
import { logger } from "../../../config/logger.js";
import { requestWechatProxy } from "../../../api/jctimes/wechat_proxy_transport.js";
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
    await wechatLimiter.tryBeforeRun(limitOption);

    const httpMethod = _.toUpper(options.method);

    if (options.path.startsWith("/cgi-bin/")) {
      const proxyOptions = await this.buildProxyRequest(options);
      const proxyResult = await requestWechatProxy({
        method: httpMethod as IRequestOptions["method"],
        path: options.path,
        tokenType: proxyOptions.tokenType,
        query: proxyOptions.query,
        payload: options.payload ?? {},
      });
      if (proxyResult.ok) {
        const data = proxyResult.data;
        if (data?.["errcode"] !== undefined && data["errcode"] !== 0) {
          logger.error(
            `请求错误！Error Code: ${data.errcode}, Error Msg: ${data.errmsg}, path: ${options.path}`
          );
        }
        return data;
      }
    }

    const query = await this.buildLocalQuery(options);
    const queryString = query ? `?${qs.stringify(query)}` : "";
    const axiosRequestConfig = {
      method: httpMethod,
      url: `${this.host}${options.path}${queryString}`,
      data: options.payload,
      timeout: 10000,
    };
    let response;
    try {
      response = await appAxios(axiosRequestConfig);
      if (response) {
        const { status, data } = response;
        if ((status && status > 200) || data["errcode"] !== 0) {
          logger.error(
            `请求错误！Error Code: ${data.errcode}, Error Msg: ${data.errmsg}, path: ${options.path}`
          );
        }
      }
      return response.data;
    } catch (e) {
      response = e.response;
      if (response) {
        const { status, data } = response;
        if (status && status > 200 && data.code && data.msg) {
          throw new Error(
            `请求错误！Error Code: ${data.code}, Error Msg: ${data.msg}, path: ${options.path}`
          );
        }
      }
      throw e;
    }
  }

  private async buildLocalQuery(options: IRequestOptions) {
    if (options.tokenType === "none") return options.query;
    if (options.query && "access_token" in options.query) return options.query;
    const accessToken = options.localAccessToken
      ? await options.localAccessToken()
      : await token.get_token();
    return { ...(options.query ?? {}), access_token: accessToken };
  }

  private async buildProxyRequest(options: IRequestOptions) {
    if (options.tokenType === "none") {
      return { tokenType: "none" as const, query: options.query ?? {} };
    }
    if (options.query && "access_token" in options.query) {
      return { tokenType: "none" as const, query: options.query };
    }

    const accessToken = options.localAccessToken
      ? await options.localAccessToken()
      : await token.get_token();
    return {
      tokenType: "none" as const,
      query: { ...(options.query ?? {}), access_token: accessToken },
    };
  }
}
