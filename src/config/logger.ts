import winston from "winston";
import { Logger as TypeORMLogger, QueryRunner } from "typeorm";

// 自定义格式化函数
const customFormat = winston.format.printf(({ level, message, timestamp }) => {
  // 获取调用栈信息
  const stack = new Error().stack?.split("\n")[3]; // 获取调用栈的第三行
  const callerInfo = stack ? stack.trim() : "";

  return `[${level}]: ${message}`;
});
// Winston logger
export const logger = winston.createLogger({
  exitOnError: false,
  level: "info",
  format: winston.format.combine(customFormat),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
  // exceptionHandlers: [new winston.transports.Console()],
  // rejectionHandlers: [new winston.transports.Console()],
});

export class CustomTypeOrmLogger implements TypeORMLogger {
  logQuery(query: string, parameters?: any[], queryRunner?: QueryRunner) {
    // 不输出查询日志
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: any[],
    queryRunner?: QueryRunner
  ) {
    logger.error(
      `Query failed: ${query}, Parameters: ${JSON.stringify(
        parameters
      )}, Error: ${error}`
    );
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: any[],
    queryRunner?: QueryRunner
  ) {
    // 不输出慢查询日志
  }

  logSchemaBuild(message: string, queryRunner?: QueryRunner) {
    // 不输出架构构建日志
  }

  logMigration(message: string, queryRunner?: QueryRunner) {
    // 不输出迁移日志
  }

  log(level: "log" | "info" | "warn", message: any) {
    // 不输出其他级别的日志
  }
}
