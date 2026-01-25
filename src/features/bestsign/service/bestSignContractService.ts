import { logger } from "../../../config/logger";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  BestSignContractRecord,
  BestSignSignerStatus,
} from "../entity/contractRecord";
import { contractApiClient } from "../api/contract";

type SendContractByTemplatePayload = {
  templateId: string;
  sender: { enterpriseName: string; account: string };
  roles: {
    roleId: string;
    userInfo: {
      enterpriseName?: string;
      userName: string;
      userAccount: string;
    };
  }[];
  enabledDocumentIds: string[];
  textLabels: { name: string; value: string }[];
  bizNo: string;
  signTextLabels: { name: string; defaultValue: string }[];
  sendAction: "DRAFT" | "APPROVE" | "SEND";
};

type SendContractByTemplateMeta = {
  senderName?: string;
  senderPhone?: string;
};

type BestSignNotificationPayload = {
  timestamp?: string;
  clientId?: string;
  type?: string;
  responseData?: Record<string, unknown>;
};

class BestSignContractService {
  async sendContractByTemplate(
    payload: SendContractByTemplatePayload,
    meta?: SendContractByTemplateMeta
  ) {
    const result = await contractApiClient.SendContractByTemplate(payload);
    const normalized = this.normalizeResponse(result);

    if (normalized?.code === "0") {
      const data = (normalized.data ?? {}) as {
        contractId?: string | number;
        draftId?: string | number;
      };
      const contractId = this.normalizeId(data.contractId);
      const draftId = this.normalizeId(data.draftId);

      const record =
        (await this.findRecord({ bizNo: payload.bizNo, contractId })) ??
        BestSignContractRecord.create();

      record.contractId = contractId ?? record.contractId;
      record.draftId = draftId ?? record.draftId;
      record.bizNo = payload.bizNo ?? record.bizNo;
      record.status = payload.sendAction ?? record.status;
      record.sendTime = new Date();
      record.senderName = meta?.senderName ?? record.senderName;
      record.senderPhone = meta?.senderPhone ?? record.senderPhone;
      record.senderEnterpriseName =
        payload.sender?.enterpriseName ?? record.senderEnterpriseName;
      record.enabledDocumentIds = payload.enabledDocumentIds;

      await BestSignContractRecord.save(record);
    }

    return normalized ?? result;
  }

  async updateStatusByBizNo(bizNo: string, status: string) {
    const record = await BestSignContractRecord.findOne({
      where: { bizNo },
    });
    if (!record) return null;
    record.status = status;
    await record.save();
    return record;
  }

  async handleNotification(payload: BestSignNotificationPayload) {
    const notificationType = payload.type?.trim();
    const responseData = payload.responseData ?? {};

    if (notificationType === "CONTRACT_SEND_RESULT") {
      await this.handleSendResultNotification(payload, responseData);
      return;
    }

    if (notificationType === "OPERATION_COMPLETE") {
      await this.handleOperationCompleteNotification(responseData);
      return;
    }

    if (notificationType === "CONTRACT_COMPLETE") {
      await this.handleContractCompleteNotification(responseData);
    }
  }

  async rejectContract(
    contractId: number,
    resignMark?: string,
    entName?: string,
    userAccount?: string
  ) {
    return await contractApiClient.rejectContract(
      contractId,
      resignMark,
      entName,
      userAccount
    );
  }

  async downloadContractFiles(
    contractIds: string[],
    options?: {
      saveLocal?: boolean;
      outputDir?: string;
      zipFileName?: string;
      unzip?: boolean;
    }
  ) {
    const result = await contractApiClient.downloadContractFiles({
      contractIds,
    });
    const normalized = this.normalizeResponse(result);

    if (!normalized || typeof normalized !== "object") {
      return normalized ?? result;
    }

    const data = normalized as { contentType?: string; content?: string };
    if (!data.content || !data.contentType) {
      return normalized ?? result;
    }

    if (!options?.saveLocal) {
      return data;
    }

    const outputDir = options.outputDir ?? "./public/bestsign";
    const zipFileName =
      options.zipFileName ?? `bestsign_contracts_${Date.now()}.zip`;
    const zipPath = path.join(outputDir, zipFileName);
    await this.ensureDir(outputDir);
    await fs.promises.writeFile(zipPath, Buffer.from(data.content, "base64"));

    let extractDir: string | null = null;
    if (options.unzip !== false && data.contentType.includes("zip")) {
      extractDir = path.join(
        outputDir,
        path.basename(zipFileName, path.extname(zipFileName))
      );
      await this.ensureDir(extractDir);
      await this.unzipFile(zipPath, extractDir);
    }

    return { zipPath, extractDir };
  }

  private async handleSendResultNotification(
    payload: BestSignNotificationPayload,
    responseData: Record<string, unknown>
  ) {
    const contractId = this.normalizeId(responseData.contractId);
    const bizNo = (responseData.bizNo as string) ?? undefined;
    const senderEnterpriseName = responseData.senderEnterpriseName as
      | string
      | undefined;
    const result = responseData.result as string | undefined;

    const record =
      (await this.findRecord({ contractId, bizNo })) ??
      BestSignContractRecord.create();

    record.contractId = contractId ?? record.contractId;
    record.bizNo = bizNo ?? record.bizNo;
    record.senderEnterpriseName =
      senderEnterpriseName ?? record.senderEnterpriseName;
    record.status = result ? `SEND_${result}` : record.status;
    record.sendTime = this.parseTimestamp(payload.timestamp) ?? record.sendTime;

    await BestSignContractRecord.save(record);
  }

  private async handleOperationCompleteNotification(
    responseData: Record<string, unknown>
  ) {
    const contractId = this.normalizeId(responseData.contractId);
    const bizNo = (responseData.bizNo as string) ?? undefined;
    const operationStatus = responseData.operationStatus as string | undefined;
    const userType = responseData.userType as string | undefined;
    const roleName = responseData.roleName as string | undefined;

    const record = await this.findRecord({ contractId, bizNo });
    if (!record) return;

    const signerStatus: BestSignSignerStatus = {
      operationStatus,
      userType,
      roleName,
    };

    record.signerStatus = [...(record.signerStatus ?? []), signerStatus];
    record.status = operationStatus ?? record.status;

    await BestSignContractRecord.save(record);
  }

  private async handleContractCompleteNotification(
    responseData: Record<string, unknown>
  ) {
    const contractIds = (responseData.contractIds as Array<string | number>) ??
      [];
    const contractId = this.normalizeId(contractIds[0]);
    const bizNo = (responseData.bizNo as string) ?? undefined;
    if (!contractId && !bizNo) return;

    const record = await this.findRecord({ contractId, bizNo });
    if (!record) return;

    record.status = "CONTRACT_COMPLETE";
    await BestSignContractRecord.save(record);
  }

  private normalizeResponse(result: unknown) {
    if (!result) return null;
    if (typeof result === "string") {
      try {
        return JSON.parse(result);
      } catch (error) {
        logger.error(error);
        return null;
      }
    }
    return result as { code?: string; data?: unknown };
  }

  private async ensureDir(directory: string) {
    await fs.promises.mkdir(directory, { recursive: true });
  }

  private async unzipFile(zipPath: string, outputDir: string) {
    const execAsync = promisify(exec);
    try {
      await execAsync(`unzip -o \"${zipPath}\" -d \"${outputDir}\"`);
    } catch (error) {
      logger.error(error);
    }
  }

  private normalizeId(id?: string | number | null) {
    if (id === undefined || id === null) return undefined;
    return String(id);
  }

  private parseTimestamp(timestamp?: string) {
    if (!timestamp) return undefined;
    const numeric = Number(timestamp);
    if (Number.isNaN(numeric)) return undefined;
    return new Date(numeric);
  }

  private async findRecord({
    contractId,
    bizNo,
  }: {
    contractId?: string;
    bizNo?: string;
  }) {
    const conditions = [] as Array<{ contractId?: string; bizNo?: string }>;
    if (contractId) conditions.push({ contractId });
    if (bizNo) conditions.push({ bizNo });
    if (!conditions.length) return null;
    return BestSignContractRecord.findOne({ where: conditions });
  }
}

export const bestSignContractService = new BestSignContractService();
