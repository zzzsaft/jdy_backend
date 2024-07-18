import axios from "axios";
import fs from "fs";
import stream from "stream";
import path from "path";
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
  const appDirectory = fs.realpathSync(process.cwd());
  const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath);
  const filePath = resolveApp(relativeFilePath);
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
}

export const readLocalFile = (localFilePath) => {
  return fs.createReadStream(localFilePath);
};
