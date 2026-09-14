import { logger } from "../config/logger.js";
import { personnelSyncInConnect, runPersonnelSync } from "../api/connector/personnel.js";
import { EmployeeService } from "../features/xft/service/employeeService.js";
import { OrgnizationService } from "../features/xft/service/orgnizationService.js";

export const syncXft = async () => {
  if (personnelSyncInConnect()) return runPersonnelSync("xft-personnel");
  await EmployeeService.syncUser();
  await OrgnizationService.syncDepartment();
  logger.info("syncXft");
};
