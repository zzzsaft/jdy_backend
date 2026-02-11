import { DataSource } from "typeorm";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const entitiesGlob = isProd
  ? [
      path.join(__dirname, "..", "entity", "*.js"),
      path.join(__dirname, "..", "entity", "*", "*.js"),
      path.join(__dirname, "..", "features", "bestsign", "entity", "*.js"),
      path.join(__dirname, "..", "features", "fbt", "entity", "*.js"),
      path.join(__dirname, "..", "features", "log", "entity", "*.js"),
      path.join(__dirname, "..", "features", "xft", "entity", "*.js"),
      path.join(__dirname, "..", "features", "vehicle", "entity", "*.js"),
    ]
  : [
      "src/entity/*.ts",
      "src/entity/*/*.ts",
      "src/features/bestsign/entity/*.ts",
      "src/features/fbt/entity/*.ts",
      "src/features/log/entity/*.ts",
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
  migrations: isProd ? ["build/src/migrations/*.js"] : ["src/migrations/*.ts"],
  logging: true,
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
  migrations: isProd ? ["build/src/migrations/*.js"] : ["src/migrations/*.ts"],
  logging: isProd ? ["error", "warn"] : true,
  synchronize: false,
});
