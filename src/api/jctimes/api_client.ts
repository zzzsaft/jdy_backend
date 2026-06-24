import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import { logger } from "../../config/logger.js";
import { IRequestOptions } from "../../type/IType.js";
import nodeRSA from "node-rsa";
import {
  decryptJson,
  encryptJson,
  isWechatProxyEncryptedBody,
} from "./wechat_proxy_crypto.js";

export type WechatProxyTokenType = "corp" | "crm" | "none";

export interface WechatProxyRequestOptions extends IRequestOptions {
  tokenType: WechatProxyTokenType;
}

export class ApiClient {
  host: string;
  constructor() {
    this.host = "http://122.226.146.110:780";
    // this.host = "http://localhost:780";
    // this.host = "http://192.168.0.216:780";
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
    // console.log(JSON.stringify(options.payload));
    // options.payload = { ...options.payload, time: new Date().getTime() };
    const axiosRequestConfig = {
      method: httpMethod,
      url: `${this.host}${options.path}${queryString}`,
      // data: { data: options.payload, sigature: genSignature(options.payload) },
      data: options.payload,
      timeout: 15000,
      headers: { Authorization: "Bearer token" },
    };
    let response;
    try {
      response = await axios(axiosRequestConfig);
      if (response) {
        const { status, data } = response;
        if (status && status > 200) {
          logger.error(`请求错误！Error data: ${data}`);
          throw new Error(`请求错误！Error data: ${data}`);
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

  async doWechatProxyRequest<T = any>(options: WechatProxyRequestOptions) {
    const secret = process.env.WECHAT_PROXY_CRYPTO_SECRET;
    if (!secret) {
      throw new Error("WECHAT_PROXY_CRYPTO_SECRET is required");
    }
    if (!options.path.startsWith("/cgi-bin/")) {
      throw new Error(
        `Wechat proxy path must start with /cgi-bin/: ${options.path}`
      );
    }

    const payload = {
      method: _.toUpper(options.method),
      path: options.path,
      tokenType: options.tokenType,
      query: options.query ?? {},
      payload: options.payload ?? {},
    };
    const axiosRequestConfig = {
      method: "POST",
      url: `${this.host}/wechat/proxy`,
      data: { encrypted: encryptJson(payload, secret) },
      timeout: 15000,
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true,
      proxy: false as false,
    };

    try {
      const response = await axios(axiosRequestConfig);
      if (!isWechatProxyEncryptedBody(response.data)) {
        throw new Error(
          `Invalid encrypted response from WeChat proxy, status: ${response.status}, path: ${payload.path}`
        );
      }
      const decrypted = decryptJson<T>(response.data.encrypted, secret);
      if (response.status && response.status > 200) {
        throw new Error(
          `请求错误！Status: ${response.status}, path: ${payload.path}`
        );
      }
      return decrypted;
    } catch (e) {
      logger.error(e?.message ?? e);
      throw e;
    }
  }
}

const genSignature = (data) => {
  const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;
  const privateKey = new nodeRSA(`-----BEGIN RSA PRIVATE KEY-----
    ${RSA_PRIVATE_KEY}
    -----END RSA PRIVATE KEY-----`);
  const signature = privateKey.sign(JSON.stringify(data), "base64");
  return signature;
};
