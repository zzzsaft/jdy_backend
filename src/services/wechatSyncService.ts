import { Department } from "../entity/basic/department";
import { User } from "../entity/basic/employee";
import { logger } from "../config/logger";

export const syncWechatData = async (corpId?: string) => {
  try {
    await Department.updateDepartment(corpId);
    await User.updateUser(corpId);
    await Department.updateXftId();
    await User.updateXftId();
    await Department.updateAllDepartmentLevel(corpId);
  } catch (error) {
    logger.error("syncWechatData error", error);
    throw error;
  }
};
