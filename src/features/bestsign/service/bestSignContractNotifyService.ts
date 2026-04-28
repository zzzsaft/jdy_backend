import { logger } from "../../../config/logger";
import {
  BestSignContractRecord,
  BestSignSignerStatus,
} from "../entity/contractRecord";
import { bestSignContractService } from "./bestSignContractService";

type BestSignNotificationPayload = {
  timestamp?: string;
  clientId?: string;
  type?: string;
  responseData?: Record<string, unknown>;
};

class BestSignContractNotifyService {
  private static readonly HR_TEMPLATE_ID = "3364564979671753730";

  async updateRecordFromOverview(
    record: BestSignContractRecord,
    overview: any
  ) {
    const data = overview?.data ?? {};

    record.overviewSenderName = String(data?.sender?.name ?? "");
    record.templateId = String(data?.templateId ?? record.templateId ?? "");
    record.templateName = String(data?.contractTitle ?? record.templateName ?? "");

    const sendTimeMs = data?.sendTime;
    if (typeof sendTimeMs === "number") {
      record.sendTime = new Date(sendTimeMs);
    }
    const finishTimeMs = data?.finishTime;
    if (typeof finishTimeMs === "number") {
      record.finishTime = new Date(finishTimeMs);
    }

    const docExtensions = data?.extDetailToSender?.docExtensions ?? [];
    if (Array.isArray(docExtensions)) {
      record.overviewLabels = docExtensions.map((d: any) => ({
        subContractId: String(d?.subContractId ?? ""),
        docTitle: String(d?.docTitle ?? ""),
        labels: Array.isArray(d?.labels)
          ? d.labels.map((l: any) => ({
              name: String(l?.name ?? ""),
              value: String(l?.value ?? ""),
            }))
          : [],
      }));
    }

    const participants: any[] = [];
    const signers = data?.signers;
    if (Array.isArray(signers)) {
      for (const s of signers) {
        participants.push({
          participantName: String(s?.participantName ?? ""),
          userType: String(s?.userType ?? ""),
          receiverType: null,
          roleName: s?.roleName ?? null,
          account: null,
          name: null,
          receiverId: null,
          routeOrder: typeof s?.routeOrder === "number" ? s.routeOrder : null,
          status: s?.status ?? null,
          finishTime: typeof s?.finishTime === "number" ? s.finishTime : null,
          signShortUrl: s?.signShortUrl ?? null,
        });
      }
    }

    if (Array.isArray(docExtensions)) {
      for (const ext of docExtensions) {
        const ps = ext?.participants;
        if (!Array.isArray(ps)) continue;
        for (const p of ps) {
          participants.push({
            participantName: String(p?.participantName ?? ""),
            userType: String(p?.userType ?? ""),
            receiverType: p?.receiverType ?? null,
            roleName: p?.roleName ?? null,
            account: p?.account ?? null,
            name: p?.name ?? null,
            receiverId: p?.receiverId ?? null,
            routeOrder: null,
            status: null,
            finishTime: null,
            signShortUrl: null,
          });
        }
      }
    }
    record.overviewParticipants = participants;

    await BestSignContractRecord.save(record);
  }
  async handleNotification(payload: BestSignNotificationPayload) {
    const notificationType = payload.type?.trim();
    const responseData = (payload.responseData ?? {}) as Record<string, any>;

    if (notificationType === "CONTRACT_SEND_RESULT") {
      await this.handleSendResultNotification(payload, responseData);
      return;
    }

    if (notificationType === "OPERATION_COMPLETE") {
      await this.handleOperationCompleteNotification(responseData);
      return;
    }

    if (notificationType === "CONTRACT_REVOKE") {
      await this.handleContractRevokeNotification(payload, responseData);
      return;
    }

    if (notificationType === "CONTRACT_COMPLETE") {
      await this.handleContractCompleteNotification(payload, responseData);
    }
  }

  private async handleSendResultNotification(
    payload: BestSignNotificationPayload,
    responseData: Record<string, any>
  ) {
    const contractId = this.normalizeId(responseData.contractId);
    const bizNo = (responseData.bizNo as string) ?? undefined;
    const senderEnterpriseName = responseData.senderEnterpriseName as
      | string
      | undefined;
    const result = responseData.result as string | undefined;

    if (!result) return;

    await this.upsertContractRecord({
      contractId,
      bizNo,
      senderEnterpriseName,
      status: `SEND_${result}`,
      resetUploads: false,
      sendTime: this.parseTimestamp(payload.timestamp),
    });
  }

  private async handleOperationCompleteNotification(
    responseData: Record<string, any>
  ) {
    const contractId = this.normalizeId(responseData.contractId);
    const bizNo = (responseData.bizNo as string) ?? undefined;
    const operationStatus = responseData.operationStatus as string | undefined;
    const userType = responseData.userType as string | undefined;
    const roleName = responseData.roleName as string | undefined;
    const signType = responseData.signType as string | undefined;
    const receiverId =
      responseData.receiverId != null
        ? this.normalizeId(responseData.receiverId) ?? String(responseData.receiverId)
        : undefined;
    const signerAccount = responseData.senderUserAccount as string | undefined;
    const signerEnterpriseName = responseData.enterpriseName as
      | string
      | undefined;
    const originUserAccounts = Array.isArray(responseData.originUserAccounts)
      ? (responseData.originUserAccounts as unknown[]).map(String)
      : undefined;
    const message = (responseData.message as string | undefined) ?? "";
    const senderEnterpriseName = responseData.senderEnterpriseName as
      | string
      | undefined;

    if (!operationStatus) return;

    const signerStatus: BestSignSignerStatus = {
      operationStatus,
      userType,
      roleName,
      signType,
      receiverId,
      signerAccount,
      signerEnterpriseName,
      originUserAccounts,
    };

    const record = await this.upsertContractRecord({
      contractId,
      bizNo,
      senderEnterpriseName,
      status: operationStatus,
      resetUploads: operationStatus === "REJECT",
      appendSignerStatus: signerStatus,
    });
    if (!record) return;

    // Delegate HR-specific side effects (JDY updates, file download/upload).
    try {
      const { hrContractService } = await import(
        "../../hr/service/hrContractService"
      );

      // If we don't have a JDY linkage yet (and it's not revoked), try to create one using overview.
      if (!record.jdyId && record.contractId && !(record.status && /REVOKE/i.test(record.status))) {
        try {
          const overview = await bestSignContractService.getContractOverview(
            record.contractId
          );
          const normalized =
            typeof overview === "string"
              ? (() => {
                  try {
                    return JSON.parse(overview);
                  } catch {
                    return null;
                  }
                })()
              : (overview as any);
          if (normalized) {
            await this.updateRecordFromOverview(record, normalized);
            const templateId = String(normalized?.data?.templateId ?? "");
            if (templateId === BestSignContractNotifyService.HR_TEMPLATE_ID) {
              await hrContractService.ensureHrContractJdyRecordFromOverview({
                record,
                overview: normalized,
              });
            }
          }
        } catch (error) {
          logger.error(error);
        }
      }

      await hrContractService.handleBestSignOperationComplete({
        record,
        operationStatus,
        roleName,
        message,
      });
    } catch (error) {
      logger.error(error);
    }
  }

  private async handleContractCompleteNotification(
    payload: BestSignNotificationPayload,
    responseData: Record<string, any>
  ) {
    const contractIds = (responseData.contractIds as Array<string | number>) ?? [];
    const contractId = this.normalizeId(contractIds[0]);
    const bizNo = (responseData.bizNo as string) ?? undefined;
    const senderEnterpriseName = responseData.senderEnterpriseName as
      | string
      | undefined;

    const record = await this.upsertContractRecord({
      contractId,
      bizNo,
      senderEnterpriseName,
      status: "CONTRACT_COMPLETE",
      resetUploads: false,
      sendTime: this.parseTimestamp(payload.timestamp),
    });
    if (!record) return;

    try {
      const { hrContractService } = await import(
        "../../hr/service/hrContractService"
      );
      if (!record.jdyId && record.contractId && !(record.status && /REVOKE/i.test(record.status))) {
        try {
          const overview = await bestSignContractService.getContractOverview(
            record.contractId
          );
          const normalized =
            typeof overview === "string"
              ? (() => {
                  try {
                    return JSON.parse(overview);
                  } catch {
                    return null;
                  }
                })()
              : (overview as any);
          if (normalized) {
            await this.updateRecordFromOverview(record, normalized);
            const templateId = String(normalized?.data?.templateId ?? "");
            if (templateId === BestSignContractNotifyService.HR_TEMPLATE_ID) {
              await hrContractService.ensureHrContractJdyRecordFromOverview({
                record,
                overview: normalized,
              });
            }
          }
        } catch (error) {
          logger.error(error);
        }
      }
      await hrContractService.handleBestSignContractComplete({ record });
    } catch (error) {
      logger.error(error);
    }
  }

  private async handleContractRevokeNotification(
    payload: BestSignNotificationPayload,
    responseData: Record<string, any>
  ) {
    const contractId = this.normalizeId(responseData.contractId);
    const bizNo = (responseData.bizNo as string) ?? undefined;
    const senderEnterpriseName = responseData.senderEnterpriseName as
      | string
      | undefined;

    await this.upsertContractRecord({
      contractId,
      bizNo,
      senderEnterpriseName,
      status: "CONTRACT_REVOKE",
      resetUploads: true,
      sendTime: this.parseTimestamp(payload.timestamp),
    });
  }

  private async upsertContractRecord(params: {
    contractId?: string;
    bizNo?: string;
    senderEnterpriseName?: string;
    status: string;
    resetUploads: boolean;
    sendTime?: Date;
    appendSignerStatus?: BestSignSignerStatus;
  }) {
    if (!params.contractId && !params.bizNo) return null;

    // Prefer bizNo as the conflict target when present (it exists earlier than contractId in some flows).
    const conflictPaths: Array<keyof BestSignContractRecord> = params.bizNo
      ? ["bizNo"]
      : ["contractId"];

    // Avoid overwriting an existing contractId/bizNo with a different value.
    // We only do a lightweight fetch when both identifiers are present and could conflict.
    if (params.bizNo && params.contractId) {
      const existing = await BestSignContractRecord.findOne({
        where: { bizNo: params.bizNo },
        select: ["contractId", "bizNo"],
      });
      if (existing?.contractId && existing.contractId !== params.contractId) {
        logger.warn("BestSign notify: contractId mismatch, ignore incoming", {
          existing: existing.contractId,
          incoming: params.contractId,
          bizNo: params.bizNo,
        });
        params = { ...params, contractId: undefined };
      }
    }
    if (params.contractId && params.bizNo && conflictPaths[0] === "contractId") {
      const existing = await BestSignContractRecord.findOne({
        where: { contractId: params.contractId },
        select: ["contractId", "bizNo"],
      });
      if (existing?.bizNo && existing.bizNo !== params.bizNo) {
        logger.warn("BestSign notify: bizNo mismatch, ignore incoming", {
          existing: existing.bizNo,
          incoming: params.bizNo,
          contractId: params.contractId,
        });
        params = { ...params, bizNo: undefined };
      }
    }

    const values: Partial<BestSignContractRecord> = {
      // conflict key must be present
      ...(params.bizNo ? { bizNo: params.bizNo } : {}),
      ...(params.contractId ? { contractId: params.contractId } : {}),
      ...(params.senderEnterpriseName
        ? { senderEnterpriseName: params.senderEnterpriseName }
        : {}),
      status: params.status,
      ...(params.sendTime ? { sendTime: params.sendTime } : {}),
      ...(params.resetUploads
        ? { afterSignUploaded: false, archiveUploaded: false }
        : {}),
    };

    await BestSignContractRecord.upsert(values as any, {
      conflictPaths: conflictPaths as any,
    });

    const record =
      (await BestSignContractRecord.findOne({
        where: params.bizNo ? { bizNo: params.bizNo } : { contractId: params.contractId },
      })) ?? null;
    if (!record) return null;

    // signerStatus needs to be appended (upsert would overwrite).
    if (params.appendSignerStatus) {
      record.signerStatus = [
        ...(record.signerStatus ?? []),
        params.appendSignerStatus,
      ];
      await BestSignContractRecord.save(record);
    }
    return record;
  }

  private async findRecord(params: { contractId?: string; bizNo?: string }) {
    if (params.contractId) {
      const record = await BestSignContractRecord.findOne({
        where: { contractId: params.contractId },
      });
      if (record) return record;
    }
    if (params.bizNo) {
      const record = await BestSignContractRecord.findOne({
        where: { bizNo: params.bizNo },
      });
      if (record) return record;
    }
    return null;
  }

  private parseTimestamp(timestamp?: string) {
    if (!timestamp) return undefined;
    const numeric = Number(timestamp);
    if (Number.isNaN(numeric)) return undefined;
    return new Date(numeric);
  }

  private normalizeId(id?: string | number | null) {
    if (id === undefined || id === null) return undefined;
    // IDs can be 19-digit integers; if it arrives as a JS number it may be rounded.
    if (typeof id === "number" && !Number.isSafeInteger(id)) {
      logger.warn("BestSign notify: unsafe numeric id encountered, skip", { id });
      return undefined;
    }
    return String(id);
  }
}

export const bestSignContractNotifyService = new BestSignContractNotifyService();
