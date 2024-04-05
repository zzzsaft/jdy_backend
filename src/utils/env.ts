import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath);
const pathsDotenv = resolveApp(".env");

// dotenv.config({ path: `${pathsDotenv}` })

if (process.env.env === "dev") {
  dotenv.config({ path: `${pathsDotenv}.dev` });
} else if (process.env.NODE_ENV === "prod") {
  dotenv.config({ path: `${pathsDotenv}.prod` });
}
