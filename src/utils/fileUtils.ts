import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import qs from "querystring";
import fs from "fs";
import stream from "stream";
import path from "path";
import { logger } from "../config/logger";
import { LogAxios } from "../entity/log/log_axios";
import { ValueTransformer } from "typeorm";
import sharp from "sharp";
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

async function saveToDb(
  config: AxiosRequestConfig,
  response: AxiosResponse,
  err?: any
) {
  if (!bool) {
    console.log({
      payload: JSON.stringify(config.data) ?? "".slice(0, 2000),
      res_data: JSON.stringify(response.data) ?? "".slice(0, 200),
    });
    return;
  }
  const { url, method, data } = config;
  const host = new URL(url ?? "").host;
  const log = {
    host,
    url: url,
    method: method,
    payload: JSON.stringify(config.data) ?? "".slice(0, 2000),
    res_status: response.status,
    res_data: JSON.stringify(response.data) ?? "".slice(0, 200),
  };
  if (err) {
    log["err"] = JSON.stringify(err);
  }
  await LogAxios.create({ ...log }).save();
}

export const appAxios = async (config: AxiosRequestConfig) => {
  let attempt = 0;
  let retries = 3;
  let delay: number = 1000;
  let response: AxiosResponse<any>;
  while (attempt < retries) {
    try {
      response = await axios(config);
      if (response) await saveToDb(config, response);
      return response;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Axios error:", error.message);
        console.error("Response data:", error.response?.data);
      } else {
        console.error("Unexpected error:", error);
      }
      if (error.response) {
        await saveToDb(config, error.response, error);
      }
      attempt++;
      console.warn(
        `Attempt ${attempt} failed. Retrying in ${delay}ms...`,
        error.message
      );
      await new Promise((resolve) => setTimeout(resolve, delay)); // 延迟
    }
  }
  return await axios(config);
};
/**
 * 将流转换为 Buffer
 * @param readable 流对象
 * @returns Promise<Buffer>
 */
function streamToBuffer(readable: stream.Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readable.on("data", (chunk) => chunks.push(chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

/**
 * 压缩文件流并返回一个 PassThrough 流
 * @param inputStream 文件流
 * @returns 返回一个 PassThrough 流，其中包含压缩后的图像数据
 */
export async function compressImage(
  inputStream: stream.Readable
): Promise<stream.PassThrough> {
  const passthrough = new stream.PassThrough(); // 创建一个 PassThrough 流
  const targetSize = 1 * 1024 * 1024; // 目标大小：1MB
  let quality = 90; // 初始压缩质量
  let outputBuffer: Buffer | null = null;

  // 将流转换为 Buffer
  const inputBuffer = await streamToBuffer(inputStream);

  // 使用 sharp 处理 Buffer
  const image = sharp(inputBuffer);

  // 持续调整质量直到图片达到目标大小
  while (true) {
    outputBuffer = await image
      .jpeg({ quality }) // 设置 JPEG 格式压缩质量
      .toBuffer();

    // 如果文件大小小于目标大小，退出循环
    if (outputBuffer.length <= targetSize) {
      break;
    }

    // 降低质量
    quality -= 5;

    // 防止质量降得太低
    if (quality <= 5) {
      break;
    }
  }

  // 将压缩后的数据写入 PassThrough 流
  passthrough.end(outputBuffer);
  console.log("图片压缩完成");

  return passthrough;
}

/**
 * 将流转换为 Base64 字符串
 * @param readable 流对象
 * @returns Promise<string> 返回 Base64 字符串
 */
export function streamToBase64(readable: stream.Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    readable.on("data", (chunk) => chunks.push(chunk)); // 收集流中的数据
    readable.on("end", () => {
      const buffer = Buffer.concat(chunks); // 将所有数据拼接成一个 Buffer
      const base64 = buffer.toString("base64"); // 转换为 Base64
      resolve(base64); // 返回 Base64 字符串
    });
    readable.on("error", reject); // 捕获流错误
  });
}
