import { logger } from "../config/logger";
import { EmployeeService } from "../features/xft/service/employeeService";
import { OrgnizationService } from "../features/xft/service/orgnizationService";

export const syncXft = async () => {
  await EmployeeService.syncUser();
  await OrgnizationService.syncDepartment();
  logger.info("syncXft");
};
