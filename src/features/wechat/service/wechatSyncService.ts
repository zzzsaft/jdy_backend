import { logger } from "../../../config/logger.js";
import { personnelSyncInConnect, runPersonnelSync } from "../../../api/connector/personnel.js";
import {
  defaultWechatCorpConfig,
  wechatCorpConfigs,
} from "../wechatCorps.js";
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
  if (personnelSyncInConnect()) return runPersonnelSync("wecom-all", corpIdOrName);
  if (!corpIdOrName) {
    for (const corp of wechatCorpConfigs) {
      try {
        await syncWechatData({ ...context, corpIdOrName: corp.corpId });
      } catch (error) {
        logger.error(`syncWechatData failed for corp ${corp.corpId}: ${error}`);
      }
    }
    return;
  }
  try {
    await syncDepartments(corpIdOrName);
    await syncUsers(corpIdOrName);
    if (
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
  if (personnelSyncInConnect()) return runPersonnelSync("wecom-departments");
  await syncDepartments();
};

export const syncAllUsers = async (): Promise<void> => {
  if (personnelSyncInConnect()) return runPersonnelSync("wecom-users");
  await syncUsers();
};
