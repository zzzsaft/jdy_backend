import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import { xftLimiter } from "../../config/limiter";
import { ILimitOpion, IRequestOptions } from "../../type/IType";
import { logger } from "../../config/logger";
import pkg from "sm-crypto";
import { appAxios } from "../../utils/fileUtils";
const { sm2, sm3 } = pkg;

class ApiClient {
  host: string;
  appid: string;
  appSecret: string;
  enterpriseId: string;

  constructor(XftConfig: IXftConfig) {
    this.host = XftConfig.host;
    this.appid = XftConfig.appid;
    this.appSecret = XftConfig.appSecret;
    this.enterpriseId = XftConfig.enterpriseId;
    if (this.appid == "" || this.appSecret == "") {
      logger.error("请配置XFT_APPID和XFT_AUTHORITY_SECRET");
    }
  }

  /**
   * 发送http请求
   * @param { Object } options - 请求参数
   * @param { String } options.method - HTTP动词 (GET|POST)
   * @param { String } options.path - 请求path
   * @param { Object } options.query - url参数,可选
   * @param { Object } options.payload - 请求参数,可选
   */
  async doRequest(
    options: IRequestOptions,
    userId: string = "A0001",
    platformUserId: string = "AUTO0001"
  ) {
    const query = options.query || {};
    const timestamp = Math.floor(Date.now() / 1000);
    query["CSCAPPUID"] = this.appid;
    query["CSCPRJCOD"] = this.enterpriseId;
    query["CSCREQTIM"] = timestamp * 1000;
    query["CSCUSRNBR"] = userId;
    query["CSCUSRUID"] = platformUserId;
    const httpMethod = _.toUpper(options.method);
    const queryString = query ? `?${qs.stringify(query)}` : "";
    const header = this.genHeaders(
      timestamp,
      options.payload || {},
      `${options.path}${queryString}`,
      httpMethod
    );
    // console.log(JSON.stringify(options.payload));
    const axiosRequestConfig = {
      method: httpMethod,
      url: `${this.host}${options.path}${queryString}`,
      // data: options.payload || {},
      timeout: 100000,
      headers: header,
    };
    if (httpMethod === "POST") {
      axiosRequestConfig["data"] = options.payload || {};
    }
    let response;
    try {
      // await xftLimiter.tryBeforeRun(limitOption);
      response = await appAxios(axiosRequestConfig);
      if (response) {
        const { status, data } = response;
        if (
          (status && status > 200) ||
          (data &&
            data.hasOwnProperty("returnCode") &&
            data["returnCode"] !== "SUC0000")
        ) {
          logger.error(
            `请求错误！Error Code: ${data.returnCode}, Error Msg: ${data.errorMsg},body: ${options.payload}`
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

  genHeaders(
    timestamp: number,
    requestBody: any,
    requestPath: string,
    method: string
  ) {
    requestBody = JSON.stringify(requestBody);
    const bodyDigest = sm3(requestBody);

    // 构建待签名字符串
    const signContent =
      method == "POST"
        ? `POST ${requestPath}\nx-alb-digest: ${requestBody}\nx-alb-timestamp: ${timestamp}`
        : `GET ${requestPath}\nx-alb-timestamp: ${timestamp}`;
    // 计算签名
    const signature = sm2.doSignature(signContent, this.appSecret, {
      hash: true,
    });
    const header = {
      "Content-Type": "application/json; charset=utf-8",
      appid: this.appid,
      // "x-alb-digest": bodyDigest,
      "x-alb-timestamp": timestamp,
      apisign: signature,
      "x-alb-verify": "sm3withsm2",
    };
    if (method == "POST") {
      header["x-alb-digest"] = bodyDigest;
    }
    return header;
  }
}

interface IXftConfig {
  host: string;
  appid: string;
  appSecret: string;
  enterpriseId: string;
}

const XftConnectConfig: IXftConfig = {
  host: process.env.XFT_HOST ?? "https://api.cmbchina.com",
  appid: process.env.XFT_APPID ?? "",
  appSecret: process.env.XFT_AUTHORITY_SECRET ?? "",
  enterpriseId: process.env.XFT_ENTERPRISE_ID ?? "",
};

const XftAppConfig: IXftConfig = {
  host: process.env.XFT_HOST ?? "https://api.cmbchina.com",
  appid: process.env.XFT_APP_APPID ?? "",
  appSecret: process.env.XFT_APP_AUTHORITY_SECRET ?? "",
  enterpriseId: process.env.XFT_ENTERPRISE_ID ?? "",
};

const XftTripConfig: IXftConfig = {
  host: process.env.XFT_HOST ?? "https://api.cmbchina.com",
  appid: process.env.XFT_TRIP_APPID ?? "",
  appSecret: process.env.XFT_TRIP_AUTHORITY_SECRET ?? "",
  enterpriseId: process.env.XFT_ENTERPRISE_ID ?? "",
};
export const appApiClient = new ApiClient(XftAppConfig);
export const connectApiClient = new ApiClient(XftConnectConfig);
// export const tripApiClient = new ApiClient(XftTripConfig);
