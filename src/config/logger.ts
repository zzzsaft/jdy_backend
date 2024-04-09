import winston from "winston";
import { DatabaseTransport } from "./database-transport";

// Winston logger
export const logger = winston.createLogger({
  exitOnError: false,
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
  // exceptionHandlers: [new winston.transports.Console()],
  // rejectionHandlers: [new winston.transports.Console()],
});
if (process.env.NODE_ENV == "development") {
  logger.add(new DatabaseTransport({ handleExceptions: true }));
}
const a = 0 / 1;
// throw new Error("This is an error");
