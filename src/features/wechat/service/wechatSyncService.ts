import { logger } from "../../../config/logger";
import { getCorpConfig } from "../wechatCorps";
import {
  syncDepartmentLevels,
  syncDepartments,
  syncXftDepartmentIds,
} from "./departmentService";
import { syncUsers, syncXftUserIds } from "./employeeService";

export type SyncContext = {
  corpIdOrName?: string;
  downstreamSystem?: string;
};

export const syncWechatData = async (context: SyncContext = {}) => {
  const { corpIdOrName } = context;
  try {
    await syncDepartments(corpIdOrName);
    await syncUsers(corpIdOrName);
    // if (corpIdOrName) {
    //   const resolvedCorpId = getCorpConfig(corpIdOrName).corpId;
    //   await syncXftDepartmentIds(resolvedCorpId);
    //   await syncXftUserIds(resolvedCorpId);
    // }
    await syncDepartmentLevels(corpIdOrName);
  } catch (error) {
    logger.error("syncWechatData error", error);
    throw error;
  }
};

export const syncAllDepartments = async (): Promise<void> => {
  await syncDepartments();
};

export const syncAllUsers = async (): Promise<void> => {
  await syncUsers();
};
