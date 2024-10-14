import nodeRSA from "node-rsa";
import crypto from "crypto";
import axios, { AxiosResponse } from "axios";
import { logger } from "../../config/logger";
import _ from "lodash";
import qs from "querystring";
import { ILimitOpion, IRequestOptions } from "../../type/IType";
import { bestSignToken } from "./token";
import { appAxios } from "../../utils/fileUtils";
interface Params {
  [key: string]: any;
}

async function handleResponse(res: AxiosResponse): Promise<any> {
  if (
    res.headers["content-type"] === "application/octet-stream" ||
    res.headers["content-type"] === "application/pdf" ||
    res.headers["content-type"] === "application/zip"
  ) {
    console.log("请求成功");
    const result = {
      contentType: res.headers["content-type"],
      content: Buffer.from(res.data, "binary").toString("base64"),
    };
    return result;
  } else {
    console.log("请求成功");
    return JSON.stringify(res.data);
  }
}

export class ApiClient {
  private host: string;
  private clientId: string;
  private clientSecret: string;
  private privateKey: string;
  constructor() {
    this.host = process.env.BESTSIGN_SERVER_HOST ?? "";
    this.clientId = process.env.BESTSIGN_CLIENT_ID ?? "";
    this.clientSecret = process.env.BESTSIGN_CLIENT_SECRET ?? "";
    this.privateKey = process.env.BESTSIGN_PRIVATE_KEY ?? "";
  }

  /**
   * 发送http请求
   * @param { Object } options - 请求参数
   * @param { String } options.method - HTTP动词 (GET|POST)
   * @param { String } options.path - 请求path
   * @param { Object } options.query - url参数,可选
   * @param { Object } options.payload - 请求参数,可选
   */
  protected async doRequest(options: IRequestOptions) {
    const httpMethod = options.method.toUpperCase();
    options.query = _.omitBy(options.query, _.isNil);
    options.query = _.isEmpty(options.query) ? null : options.query;
    options.payload = _.omitBy(options.payload, _.isNil);
    const query = options.query ? `?${qs.stringify(options.query)}` : "";
    const timestamp = Date.now();
    const signature = this.getSignature(
      options.path,
      options.method,
      options.query,
      options.payload,
      timestamp
    );
    const axiosRequestConfig = {
      method: httpMethod,
      url: `${this.host}${options.path}${query}`,
      data: options.payload,
      timeout: 5000,
      headers: await this.genHeaders(timestamp, signature),
    };
    let response;
    try {
      response = await appAxios(axiosRequestConfig);
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
  /**
   * 获取请求头
   * @param {number} timestamp 时间戳
   * @param {string} encodedSignature encode后的签名值
   */
  private async genHeaders(timestamp, encodedSignature) {
    return {
      "content-type": "application/json",
      "bestsign-client-id": this.clientId,
      "bestsign-sign-timestamp": timestamp,
      "bestsign-signature-type": "RSA256",
      "bestsign-signature": encodedSignature,
      Authorization: await bestSignToken.get_token(),
    };
  }
  private getSignature(
    uri: string,
    method: string,
    params: Params = {},
    requestBody: Params = {},
    timestamp: number
  ): string {
    if (params != null) {
      uri +=
        (method.toLowerCase() === "get" ? "?" : "") +
        this.serialize(params, "&", true);
    }

    const signObj = {
      "bestsign-client-id": this.clientId,
      "bestsign-sign-timestamp": timestamp,
      "bestsign-signature-type": "RSA256",
      "request-body": this.getMD5RequestBody(requestBody),
      uri,
    };
    let signStr = this.serialize(signObj);
    return encodeURIComponent(this.signWidthRSA(signStr));
  }
  private serialize(obj: Params, split = "", encode = false): string {
    return Object.entries(obj)
      .map(([key, value]) => `${key}=${encode ? encodeURI(value) : value}`)
      .join(split);
  }
  private getMD5RequestBody(requestBody: Params): string {
    const md5 = crypto.createHash("md5");
    let result = "";
    if (requestBody != null && Object.keys(requestBody).length > 0) {
      result = md5.update(JSON.stringify(requestBody)).digest("hex");
    } else {
      result = md5.update("").digest("hex");
    }
    return result;
  }
  private signWidthRSA(signData) {
    const key = new nodeRSA({
      b: 1024,
    });
    key.importKey(this.privateKey, "pkcs8");
    key.setOptions({ signingScheme: "pkcs1-sha256" });
    const signature = key.sign(signData, "base64", "utf8");
    return signature;
  }
}
