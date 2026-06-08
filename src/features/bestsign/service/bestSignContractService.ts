import { logger } from "../../../config/logger";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import {
  BestSignContractRecord,
} from "../entity/contractRecord";
import { contractApiClient } from "../api/contract";
import { bestSignTemplateTextLabelService } from "./bestSignTemplateTextLabelService";
import { getSealNameByEnterprise } from "../bestsign";
import fileApiClient from "../../jdy/api/file";
import { jdyFormDataApiClient } from "../../jdy/api/form_data";
import { exec } from "child_process";

const FIXED_SENDER_ACCOUNT = "18869965222";

type SendContractByTemplatePayload = {
  templateId: string;
  sender: { enterpriseName: string; account: string };
  roles: {
    roleId: string;
    userInfo: {
      enterpriseName?: string;
      userName?: string;
      userAccount?: string;
    };
  }[];
  enabledDocumentIds: string[];
  documents?: { documentId: string; disabled: boolean }[];
  textLabels: { name: string; value: string }[];
  bizNo: string;
  signTextLabels: { name: string; defaultValue: string }[];
  sendAction: "DRAFT" | "APPROVE" | "SEND";
};

type SendContractByTemplateMeta = {
  senderName?: string;
  senderPhone?: string;
  jdyId?: string;
};

class BestSignContractService {
  private resolveUploadKey(payload: any): string | null {
    if (!payload) return null;
    const key =
      payload.key ??
      payload.file_key ??
      payload.fileKey ??
      payload.data?.key ??
      payload.data?.file_key ??
      payload.data?.fileKey;
    return typeof key === "string" && key.length > 0 ? key : null;
  }

  /**
   * Common pipeline: download contract files from BestSign and upload to a JDY upload widget.
   *
   * Caller provides:
   * - appId/entryId/jdyId (target JDY record)
   * - contractId (BestSign contract)
   * - uploadWidgetKey (which JDY upload widget to fill)
   */
  async uploadContractFilesToJdyUploadWidget(params: {
    appId: string;
    entryId: string;
    jdyId: string;
    contractId: string;
    uploadWidgetKey: string;
    fileNameFallback?: string;
    extraUpdateData?: Record<string, any>;
  }) {
    const files = await this.downloadContractFilesForUpload(
      String(params.contractId)
    );
    if (!files.length) {
      logger.warn("BestSign: download file empty, skip upload", {
        jdyId: params.jdyId,
        contractId: params.contractId,
      });
      return null;
    }

    const uploadResults = await fileApiClient.uploadBuffers(
      params.appId,
      params.entryId,
      files.map((file) => ({
        fileName:
          file.name ??
          params.fileNameFallback ??
          `contract_${params.contractId}.bin`,
        buffer: file.content,
      }))
    );

    const fileKeys = uploadResults
      .map((res) => this.resolveUploadKey(res))
      .filter(Boolean) as string[];

    if (!fileKeys.length) {
      logger.warn("BestSign: upload keys empty", {
        jdyId: params.jdyId,
        contractId: params.contractId,
      });
      return null;
    }

    await jdyFormDataApiClient.singleDataUpdate(
      params.appId,
      params.entryId,
      params.jdyId,
      {
        ...(params.extraUpdateData ?? {}),
        [params.uploadWidgetKey]: { value: fileKeys },
      },
      { transaction_id: fileApiClient.transaction_id }
    );

    return fileKeys;
  }

  async sendContractByTemplate(
    payload: SendContractByTemplatePayload,
    meta?: SendContractByTemplateMeta
  ) {
    payload.sender.account = FIXED_SENDER_ACCOUNT;
    const params = await bestSignTemplateTextLabelService.getParamsByTemplateId(
      payload.templateId
    );
    if (params?.textLabels?.length) {
      const merged = new Map<string, string>();
      for (const item of params.textLabels) {
        if (!item?.name) continue;
        merged.set(item.name, item.value ?? "");
      }
      for (const item of payload.textLabels ?? []) {
        if (!item?.name) continue;
        merged.set(item.name, item.value ?? "");
      }
      payload.textLabels = Array.from(merged.entries()).map(
        ([name, value]) => ({ name, value })
      );
    }
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
      record.jdyId = meta?.jdyId ?? record.jdyId;
      record.senderEnterpriseName =
        payload.sender?.enterpriseName ?? record.senderEnterpriseName;
      record.enabledDocumentIds = payload.enabledDocumentIds;
      record.templateId = payload.templateId ?? record.templateId;
      // We don't have templateName in send-by-template response, set in overview later if available.

      await BestSignContractRecord.save(record);
    }

    return normalized ?? result;
  }

  async rejectContract(
    contractId: string | number,
    resignMark?: string,
    entName?: string,
    userAccount?: string
  ) {
    const normalizedId = this.normalizeId(contractId);
    if (normalizedId) {
      const record = await this.findRecord({ contractId: normalizedId });
      if (record?.status && /REJECT|RESIGN/i.test(record.status)) {
        logger.warn("Reject skipped: contract already rejected", {
          contractId: normalizedId,
          status: record.status,
        });
        return {
          code: "ALREADY_REJECTED",
          message: "Contract already rejected",
          contractId: normalizedId,
        };
      }
    }
    return await contractApiClient.rejectContract(
      this.normalizeId(contractId) ?? String(contractId),
      resignMark,
      entName,
      userAccount
    );
  }

  async approveContract(result: string, contractId: string) {
    const normalizedResult =
      String(result).toLowerCase() === "true" ? "true" : "false";
    return await contractApiClient.sendApprovedContract(
      normalizedResult as "true" | "false",
      String(contractId)
    );
  }

  async remindContract(contractId: string) {
    return await contractApiClient.remind(String(contractId));
  }

  async getContractOverview(contractId: string) {
    const result = await contractApiClient.overview(String(contractId));
    return this.normalizeResponse(result) ?? result;
  }

  async revokeContract(contractId: string, revokeReason = "") {
    return await contractApiClient.revokeContract(
      String(contractId),
      revokeReason ?? ""
    );
  }

  async signContract(payload: {
    bizNo?: string;
    contractId?: string;
  }) {
    const contractId = String(payload.contractId ?? "").trim();
    const bizNo = String(payload.bizNo ?? "").trim();

    const record = contractId
      ? await this.findRecord({ contractId })
      : await this.findRecord({ bizNo });
    if (!record?.contractId) {
      return {
        code: "NOT_FOUND",
        message: contractId
          ? "Contract not found for contractId"
          : "Contract not found for bizNo",
        bizNo,
        contractId,
      };
    }

    const sealName = getSealNameByEnterprise(record.senderEnterpriseName);

    // Requirement: signing uses a fixed enterprise member account.
    const account = "15868681800";

    return await contractApiClient.sign([record.contractId], sealName, {
      enterpriseName: record.senderEnterpriseName,
      account,
    });
  }

  async downloadContractFiles(
    contractIds: string[],
    options?: {
      saveLocal?: boolean;
      outputDir?: string;
      zipFileName?: string;
    }
  ) {
    const a = await this.downloadContractBinary(contractIds);
    const { buffer, contentType } = a;

    const shouldSaveLocal = options?.saveLocal ?? false;
    if (shouldSaveLocal) {
      const outputDir = options?.outputDir ?? "./public/bestsign";
      const fileName =
        options?.zipFileName ??
        this.inferDownloadedFileName(contractIds[0], contentType);
      const filePath = path.join(outputDir, fileName);
      await this.ensureDir(outputDir);
      await fs.promises.writeFile(filePath, buffer);
      // Requirement: save-to-local does not unzip.
      return { filePath, contentType };
    }

    const lower = contentType.toLowerCase();
    if (!lower.includes("zip")) {
      return {
        file: {
          name: this.inferDownloadedFileName(contractIds[0], contentType),
          content: buffer,
          contentType,
        },
      };
    }

    return { extractedData: this.extractFilesFromZipBuffer(buffer) };
  }

  async downloadContractFileForUpload(contractId: string) {
    const { buffer, contentType } = await this.downloadContractBinary([
      String(contractId),
    ]);
    const lower = contentType.toLowerCase();
    if (!lower.includes("zip")) {
      return {
        name: this.inferDownloadedFileName(String(contractId), contentType),
        content: buffer,
        contentType,
      };
    }

    const extracted = this.extractFilesFromZipBuffer(buffer);
    const folderKeys = Object.keys(extracted).sort();
    const firstFolder = folderKeys[0];
    const files = firstFolder ? extracted[firstFolder] : [];
    const firstFile = files?.[0];
    if (!firstFile?.content) return null;
    return {
      name:
        firstFile.name ??
        this.inferDownloadedFileName(String(contractId), contentType),
      content: firstFile.content,
      contentType,
    };
  }

  async downloadContractFilesForUpload(contractId: string) {
    const { buffer, contentType } = await this.downloadContractBinary([
      String(contractId),
    ]);
    const lower = contentType.toLowerCase();
    if (!lower.includes("zip")) {
      return [
        {
          name: this.inferDownloadedFileName(String(contractId), contentType),
          content: buffer,
        },
      ];
    }

    const extracted = this.extractFilesFromZipBuffer(buffer);
    const folderKeys = Object.keys(extracted).sort();
    const files: Array<{ name: string; content: Buffer }> = [];
    for (const folderKey of folderKeys) {
      const list = extracted[folderKey] ?? [];
      for (const file of list) {
        if (!file?.content) continue;
        files.push({
          name:
            file.name ??
            this.inferDownloadedFileName(String(contractId), contentType),
          content: file.content,
        });
      }
    }
    return files;
  }

  private async downloadContractBinary(contractIds: string[]) {
    const result = await contractApiClient.downloadContractFiles({
      contractIds,
    });
    const normalized = this.normalizeResponse(result);

    if (!normalized || typeof normalized !== "object") {
      throw new Error("Unexpected download response");
    }

    const data = normalized as { contentType?: string; content?: string };
    if (!data.content || !data.contentType) {
      throw new Error("Missing content/contentType");
    }

    return {
      buffer: Buffer.from(data.content, "base64"),
      contentType: String(data.contentType),
    };
  }

  private inferDownloadedFileName(
    contractId: string | undefined,
    contentType: string
  ) {
    const id = contractId || "contract";
    const lower = contentType.toLowerCase();
    if (lower.includes("pdf")) return `${id}.pdf`;
    if (lower.includes("zip")) return `${id}.zip`;
    return `${id}.bin`;
  }

  private extractFilesFromZipBuffer(zipBuffer: Buffer) {
    try {
      return this.collectExtractedFilesFromBuffer(zipBuffer);
    } catch (error) {
      logger.error(error);
      return {};
    }
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

  private collectExtractedFilesFromBuffer(zipBuffer: Buffer) {
    const extractedData: Record<string, { name: string; content: Buffer }[]> =
      {};
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;
      const [folderName, fileName] = entryName.split("/", 2);
      if (!folderName || !fileName) continue;
      const folderNumber = folderName.split("_").slice(-1)[0];
      if (!folderNumber) continue;
      if (!extractedData[folderNumber]) {
        extractedData[folderNumber] = [];
      }
      extractedData[folderNumber].push({
        name: fileName,
        content: entry.getData(),
      });
    }
    return extractedData;
  }

  private normalizeId(id?: string | number | null) {
    if (id === undefined || id === null) return undefined;
    // IMPORTANT:
    // BestSign IDs can be 19-digit integers which exceed JS MAX_SAFE_INTEGER.
    // If the ID arrives as a JS number, it may already be rounded and unsafe to persist.
    // In that case we refuse to normalize it and rely on other stable keys (e.g. bizNo),
    // or expect the caller to pass the ID as a string.
    if (typeof id === "number" && !Number.isSafeInteger(id)) {
      logger.warn("BestSign: unsafe numeric id encountered, skip persisting", {
        id,
      });
      return undefined;
    }
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
    if (contractId) {
      const record = await BestSignContractRecord.findOne({
        where: { contractId },
      });
      if (record) return record;
    }
    if (bizNo) {
      const record = await BestSignContractRecord.findOne({ where: { bizNo } });
      if (record) return record;
    }
    return null;
  }
}

export const bestSignContractService = new BestSignContractService();
