import { DataSource } from "typeorm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { CustomTypeOrmLogger } from "./logger.js";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === "production";
const isCompiledRuntime = path.extname(__filename) === ".js";
const useCompiledPaths = isProd || isCompiledRuntime;
const entitiesGlob = useCompiledPaths
  ? [
      path.join(__dirname, "..", "entity", "*.js"),
      path.join(__dirname, "..", "entity", "*", "*.js"),
      path.join(__dirname, "..", "features", "bestsign", "entity", "*.js"),
      path.join(__dirname, "..", "features", "fbt", "entity", "*.js"),
      path.join(__dirname, "..", "features", "log", "entity", "*.js"),
      path.join(
        __dirname,
        "..",
        "features",
        "productConfigAgent",
        "workflow",
        "entity",
        "*.js"
      ),
      path.join(
        __dirname,
        "..",
        "features",
        "productConfigAgent",
        "extraction",
        "entity",
        "*.js"
      ),
      path.join(
        __dirname,
        "..",
        "features",
        "productConfigAgent",
        "normalization",
        "entity",
        "*.js"
      ),
      path.join(
        __dirname,
        "..",
        "features",
        "productConfigAgent",
        "archive",
        "entity",
        "*.js"
      ),
      path.join(__dirname, "..", "llm", "entity", "*.js"),
      path.join(
        __dirname,
        "..",
        "features",
        "productConfigAgent",
        "dictionary",
        "entity",
        "*.js"
      ),
      path.join(__dirname, "..", "features", "xft", "entity", "*.js"),
      path.join(__dirname, "..", "features", "vehicle", "entity", "*.js"),
    ]
  : [
      "src/entity/*.ts",
      "src/entity/*/*.ts",
      "src/features/bestsign/entity/*.ts",
      "src/features/fbt/entity/*.ts",
      "src/features/log/entity/*.ts",
      "src/features/productConfigAgent/workflow/entity/*.ts",
      "src/features/productConfigAgent/extraction/entity/*.ts",
      "src/features/productConfigAgent/normalization/entity/*.ts",
      "src/features/productConfigAgent/archive/entity/*.ts",
      "src/llm/entity/*.ts",
      "src/features/productConfigAgent/dictionary/entity/*.ts",
      "src/features/xft/entity/*.ts",
      "src/features/vehicle/entity/*.ts",
    ];

export const AppDataSource = new DataSource({
  type: "mysql",
  host: "api.jc-times.com",
  port: 3306,
  username: process.env.mariaDBUser,
  password: process.env.mariaDBPassword,
  database: "jdy",
  entities: entitiesGlob,
  migrations: useCompiledPaths
    ? ["build/src/migrations/*.js"]
    : ["src/migrations/*.ts"],
  logging: true,
  logger: new CustomTypeOrmLogger(),
  maxQueryExecutionTime: Number(process.env.TYPEORM_SLOW_QUERY_MS ?? 1000),
  synchronize: false,
});

export const PgDataSource = new DataSource({
  type: "postgres",
  host: process.env.PgHost,
  port: 5433,
  username: process.env.PgUser,
  password: process.env.PgPassword,
  // database: "db",
  entities: entitiesGlob,
  migrations: useCompiledPaths
    ? ["build/src/migrations/*.js"]
    : ["src/migrations/*.ts"],
  logging: isProd ? ["error", "warn"] : true,
  logger: new CustomTypeOrmLogger(),
  maxQueryExecutionTime: Number(process.env.TYPEORM_SLOW_QUERY_MS ?? 1000),
  synchronize: false,
});
