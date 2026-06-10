import { logger } from "../config/logger.js";
import { EmployeeService } from "../features/xft/service/employeeService.js";
import { OrgnizationService } from "../features/xft/service/orgnizationService.js";

export const syncXft = async () => {
  await EmployeeService.syncUser();
  await OrgnizationService.syncDepartment();
  logger.info("syncXft");
};
