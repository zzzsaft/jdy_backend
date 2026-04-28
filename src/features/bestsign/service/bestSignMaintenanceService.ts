import { logger } from "../../../config/logger";
import { LogExpress } from "../../log/entity/log_express";
import { BestSignContractRecord } from "../entity/contractRecord";
import { bestSignContractNotifyService } from "./bestSignContractNotifyService";
import { jdyFormDataApiClient } from "../../jdy/api/form_data";
import { JdyUtil } from "../../../utils/jdyUtils";
import { bestSignContractService } from "./bestSignContractService";

const HR_APP_ID = "5cfef4b5de0b2278b05c8380";
const HR_ENTRY_ID = "64b915fe3b3b7c0008316594";
const HR_WIDGET_STATUS = "_widget_1690168915559";
const HR_WIDGET_ATTACHMENT_AFTER_SIGN = "_widget_1690040348946";
const HR_WIDGET_ATTACHMENT_ARCHIVE = "_widget_1690040348949";
const HR_TEMPLATE_ID = "3364564979671753730";

const quoteLargeIntegers = (jsonText: string) => {
  // Object values:  "key": 1234567890123456789
  let out = jsonText.replace(/(:\s*)(-?\d{16,})(\s*[,\}])/g, '$1"$2"$3');
  // Array values: [1234567890123456789, ...]
  out = out.replace(/([\[,]\s*)(-?\d{16,})(\s*[,\]])/g, '$1"$2"$3');
  return out;
};

class BestSignMaintenanceService {
  async replayNotifyLogs(params: { from: Date; limit?: number }) {
    const qb = LogExpress.createQueryBuilder("log")
      .where("log.path = :path", { path: "/bestsign/contract/notify" })
      .andWhere("log.created_at >= :from", { from: params.from })
      .orderBy("log.created_at", "ASC")
      .addOrderBy("log.id", "ASC");
    if (params.limit && Number.isFinite(params.limit) && params.limit > 0) {
      qb.take(params.limit);
    }

    const logs = await qb.getMany();
    logger.info("BestSign maintenance: loaded notify logs", {
      from: params.from.toISOString(),
      count: logs.length,
      limit: params.limit,
    });

    let ok = 0;
    let failed = 0;
    const bizNos = new Set<string>();
    const contractIds = new Set<string>();
    for (const row of logs) {
      try {
        const msg = String(row.msg ?? "");
        const parsed = JSON.parse(quoteLargeIntegers(msg));
        const rd = parsed?.responseData ?? {};
        if (rd?.bizNo) bizNos.add(String(rd.bizNo));
        if (rd?.contractId) contractIds.add(String(rd.contractId));
        await bestSignContractNotifyService.handleNotification(parsed);
        ok += 1;
      } catch (error) {
        failed += 1;
        logger.error("BestSign maintenance: notify replay failed", {
          logId: row.id,
          created_at: row.created_at,
          error,
        });
      }
    }

    logger.info("BestSign maintenance: notify replay done", {
      ok,
      failed,
      bizNos: bizNos.size,
      contractIds: contractIds.size,
    });
    return { ok, failed, bizNos: bizNos.size, contractIds: contractIds.size };
  }

  async fixHrJdyStatusAndFiles(params: { limit?: number }) {
    const qb = BestSignContractRecord.createQueryBuilder("r")
      .where("r.jdy_id IS NOT NULL")
      .andWhere("r.jdy_id <> ''")
      .andWhere("r.status IN (:...statuses)", {
        statuses: ["SIGN_SUCCEED", "CONTRACT_COMPLETE"],
      })
      .andWhere("(r.template_id IS NULL OR r.template_id = :tid)", {
        tid: HR_TEMPLATE_ID,
      })
      .orderBy("r.id", "ASC");
    if (params.limit && Number.isFinite(params.limit) && params.limit > 0) {
      qb.take(params.limit);
    }

    const records = await qb.getMany();
    logger.info("BestSign maintenance: loaded HR records", {
      count: records.length,
      limit: params.limit,
    });

    let updatedStatus = 0;
    let uploaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const record of records) {
      try {
        const jdyId = String(record.jdyId ?? "");
        if (!jdyId) {
          skipped += 1;
          continue;
        }

        const existing = await jdyFormDataApiClient.singleDataQuery(
          HR_APP_ID,
          HR_ENTRY_ID,
          jdyId
        );
        const existingData = (existing as any)?.data ?? existing;
        const statusText = JdyUtil.getText(existingData?.[HR_WIDGET_STATUS]);

        const targetStatus =
          record.status === "CONTRACT_COMPLETE" ? "签署完成" : "乙方已签署";
        const needUpdateStatus = statusText === "已发送";

        const uploadWidgetKey =
          record.status === "CONTRACT_COMPLETE"
            ? HR_WIDGET_ATTACHMENT_ARCHIVE
            : HR_WIDGET_ATTACHMENT_AFTER_SIGN;

        const attachmentValue = JdyUtil.getValue(
          existingData?.[uploadWidgetKey]
        ) as any;
        const keys = Array.isArray(attachmentValue?.value)
          ? attachmentValue.value
          : Array.isArray(attachmentValue)
            ? attachmentValue
            : [];

        if (!keys.length) {
          const fileKeys =
            await bestSignContractService.uploadContractFilesToJdyUploadWidget({
              appId: HR_APP_ID,
              entryId: HR_ENTRY_ID,
              jdyId,
              contractId: record.contractId,
              uploadWidgetKey,
            });
          if (fileKeys?.length) {
            uploaded += 1;
            if (record.status === "CONTRACT_COMPLETE") {
              record.archiveUploaded = true;
            } else {
              record.afterSignUploaded = true;
            }
            await BestSignContractRecord.save(record);
          }
        }

        if (needUpdateStatus) {
          await jdyFormDataApiClient.singleDataUpdate(
            HR_APP_ID,
            HR_ENTRY_ID,
            jdyId,
            { [HR_WIDGET_STATUS]: JdyUtil.setText(targetStatus) }
          );
          updatedStatus += 1;
        }
      } catch (error) {
        failed += 1;
        logger.error("BestSign maintenance: fix failed", {
          contractId: record.contractId,
          bizNo: record.bizNo,
          jdyId: record.jdyId,
          error,
        });
      }
    }

    logger.info("BestSign maintenance: fix done", {
      updatedStatus,
      uploaded,
      skipped,
      failed,
    });
    return { updatedStatus, uploaded, skipped, failed };
  }
}

export const bestSignMaintenanceService = new BestSignMaintenanceService();

