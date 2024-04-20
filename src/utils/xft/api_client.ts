import _ from "lodash";
import axios from "axios";
import qs from "querystring";
import { xftLimiter } from "../../config/limiter";
import { ILimitOpion, IRequestOptions } from "../../type/IType";
import { logger } from "../../config/logger";
import crypto from "crypto";
import { sm2 } from "sm-crypto";
import edge from "edge-js";
import fs from "fs";
import path from "path";
interface Headers {
  "Content-Type": "application/json";
  appid: string;
  "x-alb-digest": string;
  "x-alb-timestamp": number;
  apisign: string;
  "x-alb-verify": "sm3withsm2";
}

export class ApiClient {
  host: string = process.env.XFT_HOST ?? "https://api.cmbchina.com";
  appid: string = process.env.XFT_APPID ?? "";
  appSecret: string = process.env.XFT_AUTHORITY_SECRET ?? "";
  CSCPRJCOD: string = process.env.XFT_CSCPRJCOD ?? "";
  CSCUSRNBR: string = process.env.XFT_CSCUSRNBR ?? "";
  CSCUSRUID: string = process.env.XFT_CSCUSRUID ?? "";

  constructor() {
    if (this.appid == "" || this.appSecret == "") {
      logger.error("请配置XFT_APPID和XFT_AUTHORITY_SECRET");
    }
    this.useDll();
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
  async doRequest(options: IRequestOptions, limitOption: ILimitOpion) {
    const query = options.query || {};
    const timestamp = Date.now();
    query["CSCAPPUID"] = this.appid;
    query["CSCPRJCOD"] = this.CSCPRJCOD;
    query["CSCREQTIM"] = timestamp;
    query["CSCUSRNBR"] = this.CSCUSRNBR;
    query["CSCUSRUID"] = this.CSCUSRUID;
    const httpMethod = _.toUpper(options.method);
    const queryString = query ? `?${qs.stringify(query)}` : "";
    const header = this.genHeaders(
      timestamp,
      options.payload || {},
      `${options.path}${queryString}`,
      httpMethod
    );
    const axiosRequestConfig = {
      method: httpMethod,
      url: `${this.host}${options.path}${queryString}`,
      data: options.payload || {},
      timeout: 5000,
      header: header,
    };
    let response;
    try {
      await xftLimiter.tryBeforeRun(limitOption);
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
      logger.info(`xft请求成功！`);
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
    timestamp: number,
    requestBody: any,
    requestPath: string,
    method: string
  ): Headers {
    timestamp = Math.floor(timestamp / 1000);
    const sm3 = crypto.createHash("sm3");
    const bodyDigest = sm3.update(JSON.stringify(requestBody)).digest("hex");

    // 构建待签名字符串
    const signContent =
      method == "POST"
        ? `POST ${requestPath}` +
          "\\n" +
          `x-alb-digest: ${JSON.stringify(
            requestBody
          )}\\nx-alb-timestamp: ${timestamp}`
        : `GET ${requestPath}` + "\\n" + `x-alb-timestamp: ${timestamp}`;
    // 计算签名
    console.log(signContent);
    const signature = this.sm3withsm2Signature(this.appSecret, signContent);

    return {
      "Content-Type": "application/json",
      appid: this.appid,
      "x-alb-digest": bodyDigest,
      "x-alb-timestamp": timestamp,
      apisign: signature,
      "x-alb-verify": "sm3withsm2",
    };
  }
  sm3withsm2Signature(authoritySecret, signStr) {
    // Convert authoritySecret from hex string to Buffer
    const key = Buffer.from(authoritySecret, "hex").toJSON().data;
    // Convert signStr to Buffer
    const data = Buffer.from(signStr, "utf8").toJSON().data;

    // const domainParameters = sm2.generateKeyPairHex(256, key);
    // const domainParameters1 = sm2.getPrivateKeyFromHex(256, key);
    const { privateKey, publicKey } = sm2.generateKeyPairHex(authoritySecret);
    console.log(privateKey, publicKey);
    // Sign the data using SM2
    const signature = sm2.doSignature(signStr, privateKey, {
      pointPool: [
        sm2.getPoint(),
        sm2.getPoint(),
        sm2.getPoint(),
        sm2.getPoint(),
      ], // 传入事先已生成好的椭圆曲线点，可加快签名速度
    });

    return signature;
  }
  useDll() {
    const appDirectory = fs.realpathSync(process.cwd());
    const resolveApp = (relativePath) =>
      path.resolve(appDirectory, relativePath);
    const paths = resolveApp("src/utils/xft/XftNewSDK.dll");
    const BaseReqInf = edge.func({
      assemblyFile: paths,
      typeName: "XftNewSDK.Model.BaseReqInf",
      methodName: "BaseReqInf",
    });
    // 调用C#对象的构造函数并传递参数
    BaseReqInf(
      {
        companyId: this.CSCPRJCOD,
        appId: this.appid,
        authoritySecret: this.appSecret,
      },
      function (error, baseReqInf) {
        if (error) {
          console.error("Error:", error);
        } else {
          // 构造函数返回的 baseReqInf 对象可以用于后续的方法调用
          // 您可以将其传递给其他Edge.js函数或直接使用它调用C#方法
          // 比如：baseReqInf.doSomething(...)
          console.log("BaseReqInf object:", baseReqInf);
        }
      }
    );
  }
}
