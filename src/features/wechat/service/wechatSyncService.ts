import { logger } from "../../../config/logger.js";
import { defaultWechatCorpConfig } from "../wechatCorps.js";
import {
  syncDepartmentLevels,
  syncDepartments,
} from "./departmentService.js";
import { syncUsers, syncXftUserIds } from "./employeeService.js";

export type SyncContext = {
  corpIdOrName?: string;
  downstreamSystem?: string;
};

export const syncWechatData = async (context: SyncContext = {}) => {
  const { corpIdOrName } = context;
  try {
    await syncDepartments(corpIdOrName);
    await syncUsers(corpIdOrName);
    if (
      !corpIdOrName ||
      corpIdOrName === defaultWechatCorpConfig.corpId ||
      corpIdOrName === defaultWechatCorpConfig.name
    ) {
      await syncXftUserIds(defaultWechatCorpConfig.corpId);
    }
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
