import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import { wechatLimiter } from "../../config/limiter";
import { ILimitOpion, IRequestOptions } from "../../type/IType";
import { logger } from "../../config/logger";
import crypto from "crypto";
const appid = "your_appid"; // 替换为你的应用编号
const appSecret = "your_app_secret"; // 替换为你的应用密钥
const requestPath = "/your/api/path"; // 替换为你的请求路径
const requestBody = {}; // 替换为你的请求体内容，如果是 GET 请求可以为空对象 {}
const timestamp = Math.floor(Date.now() / 1000).toString(); // 当前时间戳（到秒）

interface Headers {
  "Content-Type": "application/json";
  appid: string;
  "x-alb-digest": string;
  "x-alb-timestamp": number;
  apisign: string;
  "x-alb-verify": "sm3withsm2";
}

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
      timeout: 5000,
    };
    let response;
    try {
      await wechatLimiter.tryBeforeRun(limitOption);
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
      logger.info(`wechat请求成功！`);
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

  genHeaders(
    appid: string,
    requestBody: any,
    tokenType: string,
    accessToken: string
  ): Headers {
    const sm3 = crypto.createHash("sm3");
    const bodyDigest = sm3.update(JSON.stringify(requestBody)).digest("hex");
    return {
      "Content-Type": "application/json",
      appid: appid,
      "x-alb-digest": bodyDigest,
      "x-alb-timestamp": Math.floor(Date.now() / 1000),
      apisign: string,
      "x-alb-verify": "sm3withsm2",
    };
  }
}
