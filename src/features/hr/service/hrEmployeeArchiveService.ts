import { logger } from "../../../config/logger.js";
import { JdyUtil } from "../../../utils/jdyUtils.js";
import { jdyFormDataApiClient } from "../../jdy/api/form_data.js";
import { User } from "../../../entity/basic/employee.js";
import { defaultWechatCorpConfig } from "../../wechat/wechatCorps.js";

const EMP_APP_ID = "5cfef4b5de0b2278b05c8380";
const EMP_ENTRY_ID = "6414573264b9920007c82491";

const JDY_ID_FIELD = "_id";

// Employee archive fields
const EMP_WIDGET_MEMBER_ID = "_widget_1690274843463";
const EMP_WIDGET_EMAIL = "_widget_1679067663792";
const EMP_FIELD_CURRENT_ADDRESS = "current_residential_address";
const EMP_WIDGET_EMERGENCY_NAME = "_widget_1679067663794";
const EMP_WIDGET_EMERGENCY_REL = "_widget_1679067663795";
const EMP_FIELD_EMERGENCY_PHONE = "contact_number";
const EMP_WIDGET_EMERGENCY_ADDR = "_widget_1679067663796";

class HrEmployeeArchiveService {
  /**
   * One-time helper: scan the employee archive JDY form and backfill `md_employee.jdy_id`
   * by matching archive field “成员id” -> `md_employee.user_id`.
   *
   * Safe to re-run; it only updates rows when `jdy_id` changes.
   */
  async syncAllEmployeeArchiveJdyIdsToDb() {
    const list = (await jdyFormDataApiClient.batchDataQuery(
      EMP_APP_ID,
      EMP_ENTRY_ID,
      {
        filter: {
          rel: "and",
          cond: [
            {
              field: EMP_WIDGET_MEMBER_ID,
              method: "not_empty",
            },
          ],
        },
        fields: [JDY_ID_FIELD, EMP_WIDGET_MEMBER_ID],
        limit: 100,
      }
    )) as any[];

    // Cross-filter: only consider users that exist in md_employee (for default corp).
    const employees = await User.find({
      where: { corp_id: defaultWechatCorpConfig.corpId },
      select: ["user_id", "jdyId"],
    });
    const employeeMap = new Map<string, string>();
    for (const emp of employees) {
      employeeMap.set(emp.user_id, emp.jdyId ?? "");
    }

    const candidates: Array<{ user_id: string; jdy_id: string }> = [];
    let missing = 0;
    let unmatched = 0;

    for (const row of list ?? []) {
      const archiveJdyId = row?._id ?? row?.[JDY_ID_FIELD];
      const member = JdyUtil.getUser(
        JdyUtil.getValue(row?.[EMP_WIDGET_MEMBER_ID]) as any
      );
      const memberId = member?.username ?? "";

      if (!archiveJdyId || !memberId) {
        missing += 1;
        continue;
      }

      const currentJdyId = employeeMap.get(memberId);
      if (currentJdyId === undefined) {
        unmatched += 1;
        continue;
      }
      if (String(currentJdyId ?? "") === String(archiveJdyId)) continue;
      candidates.push({ user_id: memberId, jdy_id: String(archiveJdyId) });
    }

    // Batch update (chunked) to avoid slow per-row update loops.
    // We update only existing rows in md_employee.
    const chunkSize = 500;
    let updated = 0;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);
      const caseParts: string[] = [];
      const params: Record<string, any> = {
        corpId: defaultWechatCorpConfig.corpId,
        ids: chunk.map((c) => c.user_id),
      };
      chunk.forEach((c, idx) => {
        params[`u${idx}`] = c.user_id;
        params[`j${idx}`] = c.jdy_id;
        caseParts.push(`WHEN user_id = :u${idx} THEN :j${idx}`);
      });

      const affected = await User.createQueryBuilder()
        .update(User)
        .set({
          jdyId: () => `CASE ${caseParts.join(" ")} ELSE jdy_id END`,
        })
        .where(`corp_id = :corpId AND user_id IN (:...ids)`, params)
        .execute();
      updated += affected.affected ?? 0;
    }

    logger.info("HR: synced employee archive jdy_id to md_employee (batch)", {
      total: list?.length ?? 0,
      employees: employees.length,
      candidates: candidates.length,
      updated,
      missing,
      unmatched,
    });
  }

  private async ensureEmployeeArchiveJdyIdByMemberId(memberId: string) {
    if (!memberId) return null;

    const employee = await User.findOne({
      where: { corp_id: defaultWechatCorpConfig.corpId, user_id: memberId },
    });
    if (employee?.jdyId) return employee.jdyId;

    // Fallback: try query JDY employee archive form by “成员id”.
    // (This depends on JDY filter semantics for user-type fields.)
    const list = (await jdyFormDataApiClient.batchDataQuery(
      EMP_APP_ID,
      EMP_ENTRY_ID,
      {
        filter: {
          rel: "and",
          cond: [
            { field: EMP_WIDGET_MEMBER_ID, method: "eq", value: [memberId] },
          ],
        },
        limit: 1,
      }
    )) as any[];
    const archiveJdyId = list?.[0]?._id ?? null;

    if (archiveJdyId && employee) {
      employee.jdyId = String(archiveJdyId);
      await employee.save();
    }

    return archiveJdyId ? String(archiveJdyId) : null;
  }

  /**
   * Update employee archive JDY record by memberId (`md_employee.user_id`).
   * Only non-empty fields are updated.
   */
  async updateEmployeeArchiveByMemberId(params: {
    employeeId: string;
    email?: string;
    currentResidentialAddress?: string;
    emergencyName?: string;
    emergencyRelation?: string;
    emergencyPhone?: string;
    emergencyAddress?: string;
  }) {
    const archiveJdyId = await this.ensureEmployeeArchiveJdyIdByMemberId(
      params.employeeId
    );
    if (!archiveJdyId) {
      logger.warn("HR: employee archive jdy_id not found", {
        employeeId: params.employeeId,
      });
      return false;
    }

    const update: Record<string, any> = {};
    if (params.email?.trim())
      update[EMP_WIDGET_EMAIL] = JdyUtil.setText(params.email.trim());
    if (params.currentResidentialAddress?.trim())
      update[EMP_FIELD_CURRENT_ADDRESS] = JdyUtil.setAddress({
        detail: params.currentResidentialAddress.trim(),
      });
    if (params.emergencyName?.trim())
      update[EMP_WIDGET_EMERGENCY_NAME] = JdyUtil.setText(
        params.emergencyName.trim()
      );
    if (params.emergencyRelation?.trim())
      update[EMP_WIDGET_EMERGENCY_REL] = JdyUtil.setText(
        params.emergencyRelation.trim()
      );
    if (params.emergencyPhone?.trim())
      update[EMP_FIELD_EMERGENCY_PHONE] = JdyUtil.setText(
        params.emergencyPhone.trim()
      );
    if (params.emergencyAddress?.trim())
      update[EMP_WIDGET_EMERGENCY_ADDR] = JdyUtil.setAddress({
        detail: params.emergencyAddress.trim(),
      });

    if (!Object.keys(update).length) return true;

    await jdyFormDataApiClient.singleDataUpdate(
      EMP_APP_ID,
      EMP_ENTRY_ID,
      archiveJdyId,
      update
    );
    return true;
  }

  /**
   * Legacy fallback: find employee archive JDY record by stable identifiers.
   *
   * NOTE: the queried field keys (e.g. `id_card_number`) depend on your JDY employee archive schema.
   * If your employee archive uses widget keys instead, adjust the field names inside `tryQuery`.
   */
  async findEmployeeArchiveId(params: {
    employeeId: string;
    employeeName: string;
    employeePhone: string;
  }) {
    const { employeeId, employeeName, employeePhone } = params;

    const tryQuery = async (field: string, value: string) => {
      if (!value) return null;
      const list = await jdyFormDataApiClient.batchDataQuery(
        EMP_APP_ID,
        EMP_ENTRY_ID,
        {
          filter: {
            rel: "and",
            cond: [{ field, method: "eq", value: [value] }],
          },
          limit: 1,
        }
      );
      const first: any = Array.isArray(list) ? (list[0] as any) : null;
      return first?._id ?? null;
    };

    // Most stable -> least stable.
    return (
      (await tryQuery("id_card_number", employeeId)) ||
      (await tryQuery("mobile_phone", employeePhone)) ||
      (await tryQuery("full_name", employeeName))
    );
  }
}

export const hrEmployeeArchiveService = new HrEmployeeArchiveService();
