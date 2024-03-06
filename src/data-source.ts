import { DataSource } from "typeorm";

export const AppDataSource = new DataSource({
  type: "mysql",
  host: "api.jc-times.com",
  port: 3306,
  username: "root",
  password: "Nas_MariaDB10",
  database: "jdy",
  entities: ["src/entity/*.ts", "src/entity/*/*.ts"],
  logging: true,
  synchronize: false,
});
