import winston from "winston";
import { Logger as TypeORMLogger, QueryRunner } from "typeorm";

const customFormat = winston.format.printf(({ level, message }) => {
  return `[${level}]: ${message}`;
});

export const logger = winston.createLogger({
  exitOnError: false,
  level: "info",
  format: winston.format.combine(customFormat),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

export class CustomTypeOrmLogger implements TypeORMLogger {
  logQuery(query: string, parameters?: any[], queryRunner?: QueryRunner) {
    // Keep normal query logging quiet; slow queries are logged by logQuerySlow.
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: any[],
    queryRunner?: QueryRunner,
  ) {
    logger.error(
      `Query failed: ${query}, Parameters: ${JSON.stringify(
        parameters ?? [],
      )}, Error: ${error}`,
    );
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: any[],
    queryRunner?: QueryRunner,
  ) {
    logger.warn(
      `[typeorm:slowQuery] timeMs=${time} query=${query} parameters=${JSON.stringify(
        parameters ?? [],
      )}`,
    );
  }

  logSchemaBuild(message: string, queryRunner?: QueryRunner) {
    // Intentionally quiet.
  }

  logMigration(message: string, queryRunner?: QueryRunner) {
    // Intentionally quiet.
  }

  log(level: "log" | "info" | "warn", message: any) {
    // Intentionally quiet.
  }
}
