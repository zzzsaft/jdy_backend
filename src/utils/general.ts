import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import qs from "querystring";
import fs from "fs";
import stream from "stream";
import path from "path";
import { logger } from "../config/logger";
import { LogAxios } from "../entity/log/log_axios";
import { ValueTransformer } from "typeorm";
const bool = process.env.NODE_ENV === "production";
export async function downloadFileStream(url) {
  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });
    const passthrough = new stream.PassThrough(); // 创建一个 PassThrough 流
    response.data.pipe(passthrough); // 将文件流管道传输到 PassThrough 流
    return passthrough; // 返回响应流
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Axios error:", error.message);
      console.error("Response data:", error.response?.data);
    } else {
      console.error("Unexpected error:", error);
    }
    throw error; // 重新抛出错误，以便上层捕获
  }
}

export async function downloadFile(url, relativeFilePath) {
  if (!url) return null;
  try {
    const filePath = getLocalFilePath(relativeFilePath);
    const directory = path.dirname(filePath);

    // Ensure the directory exists
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    const writer = fs.createWriteStream(filePath);

    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });

    response.data.pipe(writer);

    new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
    return relativeFilePath;
  } catch (error) {
    logger.error(error);
    return null;
  }
}

export const getLocalFilePath = (relativeFilePath) => {
  const appDirectory = fs.realpathSync(process.cwd());
  const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath);
  return resolveApp(relativeFilePath);
};

export const readLocalFile = (localFilePath) => {
  return fs.createReadStream(localFilePath);
};

export const appAxios = async (config: AxiosRequestConfig) => {
  let response: AxiosResponse<any>;
  try {
    response = await axios(config);
    const { status, data } = response;
    const host = new URL(config.url ?? "").host;
    if (bool) {
      await LogAxios.create({
        host,
        url: config.url,
        method: config.method,
        payload: JSON.stringify(config.data) ?? "".slice(0, 2000),
        res_status: status,
        res_data: JSON.stringify(data) ?? "".slice(0, 200),
      }).save();
    } else {
      console.log({
        host,
        url: config.url,
        method: config.method,
        payload: JSON.stringify(config.data) ?? "".slice(0, 2000),
        res_status: status,
        res_data: JSON.stringify(data) ?? "".slice(0, 200),
      });
    }
  } catch (e) {
    response = e.response;
    if (response && bool) {
      const { status, data } = response;
      const host = new URL(config.url ?? "").host;
      await LogAxios.create({
        host,
        url: config.url,
        method: config.method,
        payload: JSON.stringify(config.data) ?? "".slice(0, 2000),
        res_status: status,
        res_data: JSON.stringify(data) ?? "".slice(0, 200),
        err: JSON.stringify(e),
      }).save();
    }
    if (!bool) {
      console.log({
        host: new URL(config.url ?? "").host,
        url: config.url,
        method: config.method,
        payload: JSON.stringify(config.data) ?? "".slice(0, 2000),
        res_status: response?.status,
        res_data: JSON.stringify(response?.data) ?? "".slice(0, 200),
      });
    }
    if (response) {
      return response.data;
    }
    throw e;
  }
  return response;
};

export const createWechatUrl = (redirectUrl: string) => {
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=${qs.escape(
    redirectUrl
  )}&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect`;
};

export const getDay = (date: string) => {
  // 映射英文星期到中文
  const daysMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return daysMap[new Date(date).getDay()];
};

export const getHalfDay = (date: string | Date) => {
  const hour = new Date(date).getHours();
  return hour < 12 ? "AM" : "PM";
};

// 创建 ValueTransformer 来处理 POINT 数据
export const pointTransformer: ValueTransformer = {
  to: (coordinates: { longitude: number; latitude: number } | undefined) => {
    if (coordinates) {
      return [coordinates.longitude, coordinates.latitude];
    }
    // 如果 coordinates 为 undefined，返回 null 或者默认值
    return null; // 或者 `POINT(0 0)`
  },
  from: (point: string) => {
    if (!point) return null;
    const match = point.match(/POINT\(([\d.-]+) ([\d.-]+)\)/);
    if (match) {
      return {
        longitude: parseFloat(match[1]),
        latitude: parseFloat(match[2]),
      };
    }
    return { longitude: 0, latitude: 0 };
  },
};
