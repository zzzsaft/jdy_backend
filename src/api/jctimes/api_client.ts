import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import { logger } from "../../config/logger";
import { IRequestOptions } from "../../type/IType";
import nodeRSA from "node-rsa";

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
}

const genSignature = (data) => {
  const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;
  const privateKey = new nodeRSA(`-----BEGIN RSA PRIVATE KEY-----
    ${RSA_PRIVATE_KEY}
    -----END RSA PRIVATE KEY-----`);
  const signature = privateKey.sign(JSON.stringify(data), "base64");
  return signature;
};
