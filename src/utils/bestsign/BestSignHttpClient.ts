import NodeRSA from "node-rsa";
import crypto from "crypto";
import axios, { AxiosResponse } from "axios";
import dotenv from "dotenv";

interface Params {
  [key: string]: any;
}

interface Headers {
  "content-type": string;
  "bestsign-client-id": string;
  "bestsign-sign-timestamp": number;
  "bestsign-signature-type": string;
  "bestsign-signature": string;
  Authorization: string;
}

const clientId = process.env.BESTSIGN_CLIENT_ID;
const privateKey = process.env.BESTSIGN_CLIENT_SECRET;

function serialize(obj: Params, split = "", encode = false): string {
  return Object.entries(obj)
    .map(([key, value]) => `${key}=${encode ? encodeURI(value) : value}`)
    .join(split);
}

function getMD5RequestBody(requestBody: Params): string {
  const md5 = crypto.createHash("md5");
  let result = "";
  if (requestBody != null) {
    result = md5.update(JSON.stringify(requestBody)).digest("hex");
  } else {
    result = md5.update("").digest("hex");
  }
  return result;
}

function signWidthRSA(data: string, privateKey: string): string {
  const key = new NodeRSA({ b: 1024 });
  key.importKey(privateKey, "pkcs8");
  key.setOptions({ signingScheme: "sha256" });
  const signature = key.sign(data, "base64", "utf8");
  return signature;
}

function getSignature(
  uri: string,
  method: string,
  params: Params = {},
  requestBody: Params = {},
  timestamp: number,
  clientId: string,
  privateKey: string
): string {
  uri +=
    (method.toLowerCase() === "get" ? "?" : "") + serialize(params, "&", true);
  const signObj = {
    "bestsign-client-id": clientId,
    "bestsign-sign-timestamp": timestamp,
    "bestsign-signature-type": "RSA256",
    "request-body": getMD5RequestBody(requestBody),
    uri,
  };
  let signStr = serialize(signObj);
  return signWidthRSA(signStr, privateKey);
}

function genHeaders(
  clientId: string,
  timestamp: number,
  encodedSignature: string,
  tokenType: string,
  accessToken: string
): Headers {
  return {
    "content-type": "application/json",
    "bestsign-client-id": clientId,
    "bestsign-sign-timestamp": timestamp,
    "bestsign-signature-type": "RSA256",
    "bestsign-signature": encodedSignature,
    Authorization: `${tokenType} ${accessToken}`,
  };
}

class Token {
  private accessToken: string = "";
  private expire: number = 0;

  constructor() {}

  private async _get_token(): Promise<any> {
    let result = {};
    await axios
      .post(
        `${process.env.BESTSIGN_SERVER_HOST}/api/oa2/client-credentials/token`,
        {
          clientId: process.env.BESTSIGN_CLIENT_ID,
          clientSecret: process.env.BESTSIGN_CLIENT_SECRET,
        }
      )
      .then((res) => {
        result = res.data;
      })
      .catch((err) => {
        const { errno, errmsg } = err.response.data;
        console.log(`getToken response: { errno: ${errno}  error: ${errmsg} }`);
      });
    return result["data"];
  }

  public async get_token(): Promise<string> {
    if (Date.now() < this.expire * 1000) {
      return this.accessToken;
    } else {
      const { accessToken, expiration } = await this._get_token();
      this.accessToken = accessToken;
      this.expire = expiration;
      return this.accessToken;
    }
  }
}
const bestSignToken = new Token();

async function post_request(
  uri: string,
  headerParams: any,
  requestBody: any
): Promise<any> {
  const method = "POST";
  const timestamp = Date.now();
  // 获取access_token
  let accessToken = await bestSignToken.get_token();
  const signature = getSignature(
    uri,
    method,
    headerParams,
    requestBody,
    timestamp,
    clientId,
    privateKey
  );
  // 对签名进行encode
  const encodedSignature = encodeURIComponent(signature);
  // 组装headers对象
  const headers = genHeaders(
    clientId,
    timestamp,
    encodedSignature,
    "bearer",
    accessToken
  );
  const axiosRequestConfig = {
    method: method,
    url: `${process.env.BESTSIGN_SERVER_HOST}${uri}`,
    data: JSON.stringify(requestBody),
    timeout: 5000,
    header: headers,
  };

  // console.log(requestOptions);
  let result = {};
  await axios(axiosRequestConfig)
    .then(async (res: AxiosResponse) => {
      if (res.status === 200) {
        result = await handleResponse(res);
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

async function get_request(uri: string, headerParams: any): Promise<any> {
  const method = "get";
  const timestamp = Date.now();

  // 获取access_token
  let accessToken = await bestSignToken.get_token();
  // 生成base64格式的签名
  const signature = getSignature(
    uri,
    method,
    headerParams,
    null,
    timestamp,
    clientId,
    privateKey
  );
  // 对签名进行encode
  const encodedSignature = encodeURIComponent(signature);
  // 组装headers对象
  const headers = genHeaders(
    clientId,
    timestamp,
    encodedSignature,
    "bearer",
    accessToken
  );
  const requestOptions = {
    url: uri,
    method,
    header: headers,
  };

  console.log(requestOptions);
  let result = {};
  await axios(requestOptions)
    .then(async (res: AxiosResponse) => {
      if (res.status === 200) {
        result = await handleResponse(res);
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

export { getSignature, genHeaders, signWidthRSA, getMD5RequestBody, serialize };
