import { logger } from "../../../config/logger";
import {
  syncDepartmentLevels,
  syncDepartments,
  syncXftDepartmentIds,
} from "./departmentService";
import {
  syncUsers,
  syncXftUserIds,
} from "./employeeService";

export type SyncContext = {
  corpId?: string;
  downstreamSystem?: string;
};

export const syncWechatData = async (context: SyncContext = {}) => {
  const { corpId } = context;
  try {
    await syncDepartments(corpId);
    await syncUsers(corpId);
    if (corpId) {
      await syncXftDepartmentIds(corpId);
      await syncXftUserIds(corpId);
    }
    await syncDepartmentLevels(corpId);
  } catch (error) {
    logger.error("syncWechatData error", error);
    throw error;
  }
};
