import NodeRSA from "node-rsa";
import crypto from "crypto";
import _ from "lodash";
import qs from "querystring";
import { IRequestOptions } from "../../../type/IType";
import { appAxios } from "../../../utils/fileUtils";
import { bestSignToken } from "./token";
import axios from "axios";
interface Params {
  [key: string]: any;
}

export class ApiClient {
  private host: string;
  private clientId: string;
  private privateKey: string;

  constructor() {
    this.host = process.env.BESTSIGN_SERVER_HOST ?? "";
    this.clientId = process.env.BESTSIGN_CLIENT_ID ?? "";
    this.privateKey = process.env.BESTSIGN_PRIVATE_KEY ?? "";
  }

  protected async doRequest(options: IRequestOptions, host?: string) {
    const httpMethod = options.method.toUpperCase();
    // const timestamp = 1768483850514;
    const timestamp = Date.now();
    options.query = _.omitBy(options.query, _.isNil);
    options.query = _.isEmpty(options.query) ? null : options.query;
    let uri = options.path;
    let signature;
    if (httpMethod == "GET") {
      const headerParams = options.query;
      // 生成base64格式的签名
      if (headerParams != null) {
        if (uri.includes("?")) {
          uri += "&" + this.serialize(headerParams, "&", true);
        } else {
          uri += "?" + this.serialize(headerParams, "&", true);
        }
      }

      signature = this.getSignature(uri, null, timestamp, httpMethod);
      // 对签名进行encode
      // const encodedSignature = encodeURIComponent(signature);
      // 组装headers对象
      const headers = await this.genHeaders(timestamp, signature);
      const requestOptions = {
        // url: uri,
        url: `${this.host}${uri}`,
        method: httpMethod,
        headers,
      };
      //requestOptions.params = params;
      let result = {};

      await axios(requestOptions)
        .then(async (res) => {
          if (res.status === 200) {
            result = await this.handleResponse(res);
            return result;
          } else {
            console.log(JSON.stringify(res));
            console.log("请求失败");
            return JSON.stringify(res);
          }
        })
        .catch((err) => {
          console.log("请求异常");
          console.log(JSON.stringify(err));
        });
      return result;
    } else if (httpMethod == "POST") {
      const signature = this.getSignature(
        uri,
        options.payload,
        timestamp,
        httpMethod
      );

      // 组装headers对象
      const headers = await this.genHeaders(timestamp, signature);
      const requestOptions = {
        url: uri,
        method: httpMethod,
        headers,
        data: JSON.stringify(options.payload),
      };
      // console.log(requestOptions);
      let result = {};
      await axios(requestOptions)
        .then(async (res) => {
          if (res.status === 200) {
            result = await this.handleResponse(res);
            console.log(JSON.stringify(result));
            return result;
          } else {
            console.log(JSON.stringify(res));
            console.log("请求失败");
            return JSON.stringify(res);
          }
        })
        .catch((err) => {
          console.log("请求异常");
          console.log(JSON.stringify(err));
        });
      return result;
    }

    options.payload =
      options.method == "GET" ? null : _.omitBy(options.payload, _.isNil);
    const query = options.query
      ? `?${this.serialize(options.query, "&", true)}`
      : "";
    const axiosRequestConfig = {
      method: httpMethod,
      url: `${this.host}${uri}`,
      data: options.payload,
      timeout: 5000,
      headers: await this.genHeaders(timestamp, signature),
    };
    // console.log(axiosRequestConfig.url);
    return await axios(axiosRequestConfig);
  }

  private getSignature(uri, requestBody, timestamp, method) {
    const signObj = {
      "bestsign-client-id": this.clientId,
      "bestsign-sign-timestamp": timestamp,
      "bestsign-signature-type": "RSA256",
      "request-body": this.getMD5RequestBody(requestBody), // 'd41d8cd98f00b204e9800998ecf8427e', // 如果是POST请求，则为requestBody的JSON字符串的MD5值，如果是GET请求则为空字符串的MD5值
      uri, // 请求的URI地址，如果是GET请求，param也要带上。URL另外一个示例是 /api/templates/2014339350078160897
    };
    let signStr = this.serialize(signObj);
    // console.log(signStr);
    const a = this.signWidthRSA(signStr);
    // console.log(a);
    return encodeURIComponent(a);
  }

  private async handleResponse(res) {
    var fs = require("fs");
    // zip或pdf格式
    const _contentType = res.headers["content-type"];
    if (
      _contentType &&
      (_contentType.includes("application/octet-stream") ||
        _contentType.includes("application/pdf") ||
        _contentType.includes("application/zip"))
    ) {
      console.log("请求成功");
      const result = {
        contentType: res.headers["content-type"],
        content: Buffer.from(res.data, "binary").toString("base64"),
      };
      return result;
    } else {
      if (res.data["code"] === "0") {
      }
      console.log("请求成功");
      return JSON.stringify(res.data);
    }
  }
  private async genHeaders(timestamp: number, encodedSignature: string) {
    const auth = await bestSignToken.get_token();
    return {
      "content-type": "application/json",
      "bestsign-client-id": this.clientId,
      "bestsign-sign-timestamp": timestamp,
      "bestsign-signature-type": "RSA256",
      // "bestsign-signature":
      //   "IlrpppCfVqsbsZUntBMck6MaMW0tGZl5D8kbvZkVbFDiEHsl2ChymN%2FWTDwPDxPDq6k8VYaXmpr%2ByEt3PyLYGOLiijwtaIw%2F0iGlEb3lQlQb6i2BuSKd3HeY%2B%2Bm6ZY9d1WaExjwkTLztMD6S1Yr1XrIeNrVaKSZVCBUTQtLiYh%2B%2FXmbK7sA%2Bhc%2BFmfZvzUTxc1bY%2BtFf%2Buc4%2BzO0zUJuyknUTChqSt%2B8D9f10ZrqOIYh62TXMIWIOaYw6eNGZvityGjr2V2P0SQNCsTaw4Iel3VDrNYnalXEb7Qw6CJItq5%2F6dqooyfhVxzeO4%2BEt8VllR94IeJwAT9YA4Wwxsu8%2Fg%3D%3D",
      "bestsign-signature": encodedSignature,
      Authorization: auth,
    };
  }

  private serialize(obj: Params, split = "", encode = false): string {
    return Object.entries(obj)
      .map(([key, value]) => `${key}=${encode ? encodeURI(value) : value}`)
      .join(split);
  }

  private getMD5RequestBody(requestBody?: Params): string {
    const md5 = crypto.createHash("md5");
    let result = "";
    if (requestBody != null) {
      result = md5.update(JSON.stringify(requestBody)).digest("hex");
    } else {
      result = md5.update("").digest("hex");
    }
    return result;
  }
  private signWidthRSA(data: string) {
    const privateKeyS = `-----BEGIN PRIVATE KEY-----
${this.privateKey}
-----END PRIVATE KEY-----`; //need add the header and footer of privateKey
    const sign = crypto.createSign("sha256");
    sign.update(data);
    sign.end();
    return sign.sign(privateKeyS).toString("base64");
  }
}
