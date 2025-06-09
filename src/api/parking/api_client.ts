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

class ApiClient {
  host: string;
  secret: string;

  constructor() {
    this.host = "http://116.148.226.245:9080/jingcheng-visitor";
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
    const query = options.query;
    const httpMethod = _.toUpper(options.method);
    const queryString = query ? `?${qs.stringify(query)}` : "";
    const header = this.genHeaders(options.payload || options.query || {});
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
        if ((status && status > 200) || !response.data["success"]) {
          logger.error(
            `请求错误！Error Code: ${data.code},body: ${data.message}`
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
          // throw new Error(
          //   `请求错误！Error Code: ${data.code}, Error Msg: ${data.msg},body: ${options.payload}`
          // );
        }
      }
      // throw e;
    }
  }

  genHeaders(requestBody: any) {
    requestBody = JSON.stringify(sortObjectKeys(requestBody)) + this.secret;
    const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zonedDate = toZonedTime(new Date(), systemTimeZone);
    const sign = createHash("md5")
      .update(requestBody, "utf8")
      .digest("hex")
      .toUpperCase();
    // console.log(requestBody);
    return {
      "X-TIMESTAMP": format(zonedDate, "yyyyMMddHHmmss", {
        timeZone: systemTimeZone,
      }),
      "X-Sign": sign,
    };
  }
}
export const apiClient = new ApiClient();

// 将对象的键按字母顺序排序
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sortedKeys = _.sortBy(_.keys(obj));
  const result = {};
  for (const key of sortedKeys) {
    result[key] = sortObjectKeys(obj[key]);
  }
  return result;
}
