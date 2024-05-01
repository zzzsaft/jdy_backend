import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath);
const pathsDotenv = resolveApp(".env");

// dotenv.config({ path: `${pathsDotenv}` })
// process.env.NODE_ENV = "production";

if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: `${pathsDotenv}.prod` });
  process.env.PORT = "2000";
} else {
  dotenv.config({ path: `${pathsDotenv}.prod` });
  process.env.PORT = "2001";
}
