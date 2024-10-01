import _ from "lodash";
import axios, { AxiosResponse } from "axios";
import qs from "querystring";
import { jdyLimiter } from "../../config/limiter";
import { ILimitOpion, IRequestOptions } from "../../type/IType";
import dotenv from "dotenv";
import { logger } from "../../config/logger";
import { appAxios } from "../general";
import { fengbeitong_token } from "./token";
export class ApiClient {
  private host: string;
  private apiKey: string;
  /**
   * 构造方法
   * @param { String } host - host
   */
  constructor() {
    this.host = process.env.FBT_HOST ?? "";
  }

  /**
   * 发送http请求
   * @param { Object } options - 请求参数
   * @param { String } options.version - 版本
   * @param { String } options.method - HTTP动词 (GET|POST)
   * @param { String } options.path - 请求path
   * @param { Object } options.query - url参数,可选
   * @param { Object } options.payload - 请求参数,可选
   */
  protected async doRequest(options: IRequestOptions) {
    const httpMethod = _.toUpper(options.method);
    const query = options.query ? `?${qs.stringify(options.query)}` : "";
    const axiosRequestConfig = {
      method: httpMethod,
      headers: {
        "access-token": await fengbeitong_token.get_token(),
        "Content-type": "application/json",
      },
      url: `${this.host}/${options.path}${query}`,
      data: options.payload,
      timeout: 15000,
    };
    let response: AxiosResponse<any>;
    try {
      response = await appAxios(axiosRequestConfig);
      if (response) {
        const { status, data } = response;
        if ((status && status > 200) || data["code"] !== 0) {
          throw `请求错误！Error Code: ${data.code}, Error Msg: ${data.msg}`;
        }
      }
      return response.data;
    } catch (e) {
      // console.log(e);
      response = e.response;
      if (response) {
        const { status, data } = response;
        if ((status && status > 200) || data["code"] !== 0) {
          logger.error(
            `请求错误！Error Code: ${data.code}, Error Msg: ${data.msg}`
          );
        }
      }
      throw e;
    }
  }
}
