import { DataSource } from "typeorm";
import dotenv from "dotenv";
dotenv.config();

export const AppDataSource = new DataSource({
  type: "mysql",
  host: "api.jc-times.com",
  port: 3306,
  username: process.env.mariaDBUser,
  password: process.env.mariaDBPassword,
  database: "jdy",
  entities: ["src/entity/*.ts", "src/entity/*/*.ts"],
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
  entities:
    //  ["src/entity/log/log_location.ts"],
    process.env.NODE_ENV === "production"
      ? ["src/entity/*.js", "src/entity/*/*.js"]
      : ["src/entity/*.ts", "src/entity/*/*.ts"],
  logging: process.env.NODE_ENV === "production" ? ["error", "warn"] : true,
  synchronize: false,
});
