import crypto from "crypto";
import url from "url";
import urlencode from "urlencode";

interface SignedURLParams {
  developerId: string;
  rtick: string;
  signType: string;
  [key: string]: string;
}

/* 计算参数签名 */
function calcRsaSign({
  developerId,
  privateKey,
  host,
  methodName,
  rtick,
  urlParams,
  requestBody,
}: {
  developerId: string;
  privateKey: string;
  host: string;
  methodName: string;
  rtick: string;
  urlParams: string;
  requestBody: string;
}): string {
  let urlStr = host + methodName;

  let mySignedURLParams: SignedURLParams = {
    developerId: developerId,
    rtick: rtick,
    signType: "rsa",
  };

  //urlParams参数处理
  if (urlParams != null && urlParams.length > 0) {
    let paramsList = urlParams.split("&");
    paramsList.forEach((p1) => {
      let p2 = p1.split("=");
      let key = p2[0];
      let value = "";
      if (p2.length == 2) {
        value = p2[1];
      }
      mySignedURLParams[key] = value;
    });
  }

  let signString = "";
  let newKeys2 = Object.keys(mySignedURLParams).sort(); //排序

  newKeys2.forEach((ele) => (signString += `${ele}=${mySignedURLParams[ele]}`));

  const urlObj = new URL(urlStr);
  signString += urlObj.pathname;

  if (requestBody != null && requestBody.length > 0) {
    let requestMd5 = getRequestMd5(requestBody);
    signString += requestMd5;
  }

  let rsaSign = signWidthRSA(privateKey, signString);
  //rsa算出来的sign，需要urlencode
  rsaSign = urlencode(rsaSign);
  return rsaSign;
}

/* 计算参数RSA签名 */
function signWidthRSA(privateKey: string, signData: string): string {
  const privateKeyS = `-----BEGIN PRIVATE KEY-----
${privateKey}
-----END PRIVATE KEY-----`; //need add the header and footer of privateKey
  const sign = crypto.createSign("RSA-SHA1");
  sign.update(signData);
  sign.end();
  return sign.sign(privateKeyS, "base64");
}

/* 获取请求体JSON字符串的md5值 */
function getRequestMd5(requestBody: string): string {
  let newRequestBody = Buffer.from(requestBody, "utf-8").toString();
  const md5 = crypto.createHash("md5");
  let result = "";
  result = md5.update(newRequestBody).digest("hex");
  return result;
}

/* 获取当前的时间戳参数 */
function getRtick(): string {
  let timestamp = Date.now();
  let rnd = Math.random() * 1000;
  let rtick = timestamp + "" + rnd;
  return rtick;
}

export { getRtick, calcRsaSign };
