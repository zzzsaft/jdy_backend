import { logger } from "../../../config/logger";
import { JdyUtil } from "../../../utils/jdyUtils";
import { jdyFormDataApiClient } from "../../jdy/api/form_data";
import { bestSignContractService } from "../../bestsign/service/bestSignContractService";
import { bestSignTemplateTextLabelService } from "../../bestsign/service/bestSignTemplateTextLabelService";
import { BestSignContractRecord } from "../../bestsign/entity/contractRecord";
import { getEnterpriseConfig } from "../../bestsign/bestsign";
import { hrEmployeeArchiveService } from "./hrEmployeeArchiveService";

const APP_ID = "5cfef4b5de0b2278b05c8380";
const ENTRY_ID = "64b915fe3b3b7c0008316594";
const HR_TEMPLATE_ID = "3364564979671753730";
const EMP_APP_ID = "5cfef4b5de0b2278b05c8380";
const EMP_ENTRY_ID = "6414573264b9920007c82491";

const WIDGET_STATUS = "_widget_1690168915559";
const WIDGET_INITIATOR = "_widget_1690479795030";
const WIDGET_MEMBER_ID = "_widget_1690349677098";
const WIDGET_COMPANY = "_widget_1690040348992";
const WIDGET_CONTRACT_SELECT = "_widget_1690006804708";
const WIDGET_SIGN_DATE = "_widget_1690006804710";
const WIDGET_BIZ_NO = "_widget_1690040348928";
const WIDGET_NEED_APPROVE = "_widget_1690040348942";
const WIDGET_ATTACHMENT_BEFORE = "_widget_1690040348941";
const WIDGET_ATTACHMENT_AFTER_SIGN = "_widget_1690040348946";
const WIDGET_ATTACHMENT_ARCHIVE = "_widget_1690040348949";
const WIDGET_REJECT_REASON = "_widget_1690168915542";
const WIDGET_CONTRACT_ID = "_widget_1690432688885";
const WIDGET_SIGN_ACTION = "_widget_1773048529020";
const WIDGET_RESIGN_MARK = "_widget_1690208103936";
const SIGN_ACTION_APPROVE = "发送前审批通过";
const SIGN_ACTION_APPROVAL_REJECT = "发送前审批拒绝";
const SIGN_ACTION_REMIND = "提醒";
const SIGN_ACTION_SIGN = "签署";
const SIGN_ACTION_REJECT_SIGN = "驳回";
const SIGN_ACTION_REVOKE = "撤回";
const SIGN_ACTION_NONE = "none";
const WIDGET_EMPLOYEE_NAME = "_widget_1690006804667";
const WIDGET_EMPLOYEE_ID = "_widget_1690006804668";
const WIDGET_EMPLOYEE_ADDR = "_widget_1690006804669";
const WIDGET_EMPLOYEE_PHONE = "_widget_1690006804676";
const WIDGET_EMPLOYEE_EMAIL = "_widget_1690006804675";
const WIDGET_EMERGENCY_REL = "_widget_1690006804672";
const WIDGET_EMERGENCY_NAME = "_widget_1690006804671";
const WIDGET_EMERGENCY_PHONE = "_widget_1690006804673";
const WIDGET_EMERGENCY_ADDR = "_widget_1690006804674";
const WIDGET_CURRENT_ADDR = "_widget_1690006804670";
const WIDGET_CONTRACT_TERM = "_widget_1690006804679";
const WIDGET_FIXED_START = "_widget_1690006804688";
const WIDGET_FIXED_END = "_widget_1690006804689";
const WIDGET_PROBATION_START = "_widget_1690006804681";
const WIDGET_PROBATION_END = "_widget_1690006804682";
const WIDGET_OPEN_END = "_widget_1690006804683";
const WIDGET_TASK_TERM = "_widget_1690006804684";
const WIDGET_TASK_MARK = "_widget_1690006804690";
const WIDGET_WORK_LOCATION = "_widget_1690006804695";
const WIDGET_WORK_ROLE = "_widget_1690006804694";
const WIDGET_WORK_TIME = "_widget_1690006804696";
const WIDGET_SOCIAL_SECURITY = "_widget_1690006804701";

// Employee archive fields
const EMP_WIDGET_EMAIL = "_widget_1679067663792";
const EMP_FIELD_CURRENT_ADDRESS = "current_residential_address";
const EMP_WIDGET_EMERGENCY_NAME = "_widget_1679067663794";
const EMP_WIDGET_EMERGENCY_REL = "_widget_1679067663795";
const EMP_FIELD_EMERGENCY_PHONE = "contact_number";
const EMP_WIDGET_EMERGENCY_ADDR = "_widget_1679067663796";

const JDY_ID_FIELD = "_id";
const CONTRACT_DOCUMENT_MAP = {
  劳动合同: "3364565370547332104",
  保密合同: "3364740383099449352",
  竞业协议: "3364804746674053122",
};

const mergeTextLabels = (
  base: { name: string; value: string }[],
  override: { name: string; value: string }[]
) => {
  const map = new Map<string, string>();
  for (const item of base) {
    if (!item?.name) continue;
    map.set(item.name, item.value ?? "");
  }
  for (const item of override) {
    if (!item?.name) continue;
    map.set(item.name, item.value ?? "");
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
};

class HrContractService {
  private overviewLabelMap(overview: any, docTitleIncludes: string) {
    const docExtensions = overview?.data?.extDetailToSender?.docExtensions ?? [];
    const doc = Array.isArray(docExtensions)
      ? docExtensions.find((d: any) =>
          String(d?.docTitle ?? "").includes(docTitleIncludes)
        )
      : null;
    const labels = doc?.labels ?? [];
    const map = new Map<string, string>();
    if (Array.isArray(labels)) {
      for (const item of labels) {
        const name = String(item?.name ?? "").trim();
        const value = String(item?.value ?? "").trim();
        if (!name) continue;
        map.set(name, value);
      }
    }
    return map;
  }

  private toJdyDate(value?: string | number | null) {
    if (value == null || value === "") return null;
    const d = typeof value === "number" ? new Date(value) : new Date(String(value));
    if (Number.isNaN(d.getTime())) return null;
    return JdyUtil.setDate(d);
  }

  private emptyJdyDate() {
    // JdyUtil.setDate treats falsy as empty.
    return JdyUtil.setDate(undefined as any);
  }

  private mapOverviewDocsToSelections(overview: any) {
    const docDetails = overview?.data?.docDetails ?? [];
    const titles = Array.isArray(docDetails)
      ? docDetails.map((d: any) => String(d?.documentTitle ?? ""))
      : [];
    const selections: string[] = [];
    if (titles.some((t) => t.includes("劳动合同"))) selections.push("劳动合同");
    if (titles.some((t) => t.includes("保密"))) selections.push("保密合同");
    if (titles.some((t) => t.includes("竞业"))) selections.push("竞业协议");
    return selections;
  }

  /**
   * When we have BestSign overview, and the record has no jdyId (and not revoked),
   * we can backfill a JDY HR contract record to keep the linkage.
   *
   * This creates a JDY record with contractId already set, so `handleCreate` will skip sending.
   */
  async ensureHrContractJdyRecordFromOverview(params: {
    record: BestSignContractRecord;
    overview: any;
  }) {
    const record = params.record;
    if (!record) return null;
    if (record.jdyId) return record.jdyId;
    if (record.status && /REVOKE/i.test(record.status)) return null;

    const overview = params.overview;
    const overviewTemplateId = String(overview?.data?.templateId ?? "").trim();
    if (overviewTemplateId && overviewTemplateId !== HR_TEMPLATE_ID) {
      logger.info("HR contract: skip JDY create for non-HR template", {
        contractId: record.contractId,
        bizNo: record.bizNo,
        templateId: overviewTemplateId,
      });
      return null;
    }
    const labelMap = this.overviewLabelMap(overview, "劳动合同");

    const company =
      String(overview?.data?.sender?.name ?? record.senderEnterpriseName ?? "").trim();
    const employeeName = (labelMap.get("员工姓名") ?? "").trim();
    const employeeId = (labelMap.get("员工身份证") ?? "").trim();
    const employeeAddr = (labelMap.get("员工地址") ?? "").trim();
    const employeePhone = (labelMap.get("员工手机号") ?? "").trim();
    const employeeEmail = (labelMap.get("员工邮箱") ?? "").trim();
    const currentAddr = (labelMap.get("法律文书寄送地址（现住址）") ?? "").trim();
    const emergencyName = (labelMap.get("紧急联系人姓名") ?? "").trim();
    const emergencyPhone = (labelMap.get("紧急联系人电话") ?? "").trim();
    const emergencyRel = (labelMap.get("紧急联系人关系") ?? "").trim();
    const emergencyAddr = (labelMap.get("紧急联系人地址") ?? "").trim();

    const contractTerm = (labelMap.get("合同期限") ?? "").trim();
    const fixedStart = (labelMap.get("固定期限1") ?? "").trim();
    const fixedEnd = (labelMap.get("固定期限2") ?? "").trim();
    const probationStart = (labelMap.get("试用期1") ?? "").trim();
    const probationEnd = (labelMap.get("试用期2") ?? "").trim();
    const openEnd = (labelMap.get("无固定期限") ?? "").trim();
    const taskTerm = (labelMap.get("任务期限") ?? "").trim();
    const taskMark = (labelMap.get("任务完成标志") ?? "").trim();
    const workLocation = (labelMap.get("工作地点") ?? "").trim();
    const workRole = (labelMap.get("工作岗位") ?? "").trim();
    const workTime = (labelMap.get("工时制度") ?? "").trim();
    const insurance = (labelMap.get("保险") ?? "").trim();
    const signDate = (labelMap.get("签署日期") ?? "").trim();

    const selectedContracts = this.mapOverviewDocsToSelections(overview);

    const sendTime = overview?.data?.sendTime;
    const bestsignStatus = String(overview?.data?.status ?? "").toUpperCase();
    const statusText =
      bestsignStatus === "SENT"
        ? "已发送"
        : bestsignStatus === "COMPLETE"
          ? "签署完成"
          : "已发送";

    const createData: Record<string, any> = {
      [WIDGET_STATUS]: JdyUtil.setText(statusText),
      [WIDGET_COMPANY]: JdyUtil.setText(company),
      [WIDGET_CONTRACT_SELECT]: JdyUtil.setCombos(selectedContracts),
      [WIDGET_SIGN_DATE]:
        this.toJdyDate(sendTime) ??
        this.toJdyDate(signDate) ??
        this.emptyJdyDate(),
      [WIDGET_BIZ_NO]: JdyUtil.setText(record.bizNo ?? ""),
      [WIDGET_CONTRACT_ID]: JdyUtil.setText(record.contractId ?? ""),

      [WIDGET_EMPLOYEE_NAME]: JdyUtil.setText(employeeName),
      [WIDGET_EMPLOYEE_ID]: JdyUtil.setText(employeeId),
      [WIDGET_EMPLOYEE_ADDR]: employeeAddr
        ? JdyUtil.setAddress({ detail: employeeAddr })
        : JdyUtil.setAddress({ detail: "" }),
      [WIDGET_EMPLOYEE_PHONE]: JdyUtil.setText(employeePhone),
      [WIDGET_EMPLOYEE_EMAIL]: JdyUtil.setText(employeeEmail),
      [WIDGET_CURRENT_ADDR]: currentAddr
        ? JdyUtil.setAddress({ detail: currentAddr })
        : JdyUtil.setAddress({ detail: "" }),

      [WIDGET_EMERGENCY_NAME]: JdyUtil.setText(emergencyName),
      [WIDGET_EMERGENCY_PHONE]: JdyUtil.setText(emergencyPhone),
      [WIDGET_EMERGENCY_REL]: JdyUtil.setText(emergencyRel),
      [WIDGET_EMERGENCY_ADDR]: emergencyAddr
        ? JdyUtil.setAddress({ detail: emergencyAddr })
        : JdyUtil.setAddress({ detail: "" }),

      [WIDGET_CONTRACT_TERM]: JdyUtil.setText(contractTerm),
      [WIDGET_FIXED_START]: this.toJdyDate(fixedStart) ?? this.emptyJdyDate(),
      [WIDGET_FIXED_END]: this.toJdyDate(fixedEnd) ?? this.emptyJdyDate(),
      [WIDGET_PROBATION_START]:
        this.toJdyDate(probationStart) ?? this.emptyJdyDate(),
      [WIDGET_PROBATION_END]:
        this.toJdyDate(probationEnd) ?? this.emptyJdyDate(),
      [WIDGET_OPEN_END]: this.toJdyDate(openEnd) ?? this.emptyJdyDate(),
      [WIDGET_TASK_TERM]: this.toJdyDate(taskTerm) ?? this.emptyJdyDate(),
      [WIDGET_TASK_MARK]: JdyUtil.setText(taskMark),
      [WIDGET_WORK_LOCATION]: JdyUtil.setText(workLocation),
      [WIDGET_WORK_ROLE]: JdyUtil.setText(workRole),
      [WIDGET_WORK_TIME]: JdyUtil.setText(workTime),
      [WIDGET_SOCIAL_SECURITY]: JdyUtil.setText(insurance),
    };

    const created = await jdyFormDataApiClient.singleDataCreate({
      app_id: APP_ID,
      entry_id: ENTRY_ID,
      data: createData,
      options: { is_start_workflow: false, is_start_trigger: false },
    });
    const createdData = (created as any)?.data ?? created;
    const newJdyId =
      createdData?._id ??
      createdData?.data?._id ??
      createdData?.id ??
      createdData?.data_id ??
      null;
    if (!newJdyId) {
      logger.warn("HR contract: created JDY record but cannot read _id", {
        contractId: record.contractId,
        bizNo: record.bizNo,
        created,
      });
      return null;
    }

    record.jdyId = String(newJdyId);
    await BestSignContractRecord.save(record);
    return record.jdyId;
  }

  /**
   * After a successful sign, we can pull signer-filled fields from BestSign contract overview,
   * then sync them into the employee archive JDY form.
   */
  private async syncEmployeeArchiveFromOverview(params: {
    contractId: string;
    contractJdyId: string;
  }) {
    // 1) Read contract form data (employee identifiers)
    const contractJdy = await jdyFormDataApiClient.singleDataQuery(
      APP_ID,
      ENTRY_ID,
      params.contractJdyId
    );
    const contractData = (contractJdy as any)?.data ?? contractJdy;

    const member = JdyUtil.getUser(
      JdyUtil.getValue(contractData?.[WIDGET_MEMBER_ID]) as any
    );
    const memberId = member?.username ?? "";
    const employeeId = JdyUtil.getText(contractData?.[WIDGET_EMPLOYEE_ID]);
    const employeeName = JdyUtil.getText(contractData?.[WIDGET_EMPLOYEE_NAME]);
    const employeePhone = JdyUtil.getText(
      contractData?.[WIDGET_EMPLOYEE_PHONE]
    );
    if (!memberId && !employeeId && !employeeName && !employeePhone) {
      logger.warn(
        "HR contract: missing employee identifiers for archive sync",
        {
          contractId: params.contractId,
          contractJdyId: params.contractJdyId,
        }
      );
      return;
    }

    // 2) Read contract overview and extract labor-contract labels
    const overview = await bestSignContractService.getContractOverview(
      params.contractId
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

    const docExtensions =
      normalized?.data?.extDetailToSender?.docExtensions ?? [];
    const labor = Array.isArray(docExtensions)
      ? docExtensions.find(
          (d: any) =>
            String(d?.subContractId) === CONTRACT_DOCUMENT_MAP.劳动合同
        )
      : null;
    const labels = labor?.labels ?? [];
    const labelMap = new Map<string, string>();
    if (Array.isArray(labels)) {
      for (const item of labels) {
        const name = String(item?.name ?? "");
        const value = String(item?.value ?? "");
        if (!name) continue;
        labelMap.set(name, value);
      }
    }

    const email = (labelMap.get("员工邮箱") ?? "").trim();
    const currentAddress = (
      labelMap.get("法律文书寄送地址（现住址）") ?? ""
    ).trim();
    const emergencyName = (labelMap.get("紧急联系人姓名") ?? "").trim();
    const emergencyPhone = (labelMap.get("紧急联系人电话") ?? "").trim();
    const emergencyRel = (labelMap.get("紧急联系人关系") ?? "").trim();
    const emergencyAddr = (labelMap.get("紧急联系人地址") ?? "").trim();

    // Preferred: update employee archive by memberId -> md_employee mapping (jdy_id).
    if (memberId) {
      await hrEmployeeArchiveService.updateEmployeeArchiveByMemberId({
        employeeId: memberId,
        email,
        currentResidentialAddress: currentAddress,
        emergencyName,
        emergencyRelation: emergencyRel,
        emergencyPhone,
        emergencyAddress: emergencyAddr,
      });
      return;
    }

    // Fallback (legacy): try to locate employee archive record by text identifiers.
    const employeeArchiveId =
      await hrEmployeeArchiveService.findEmployeeArchiveId({
        employeeId,
        employeeName,
        employeePhone,
      });
    if (!employeeArchiveId) {
      logger.warn("HR contract: employee archive not found (fallback)", {
        memberId,
        employeeId,
        employeeName,
        employeePhone,
        contractId: params.contractId,
      });
      return;
    }

    const update: Record<string, any> = {};
    if (email) update[EMP_WIDGET_EMAIL] = JdyUtil.setText(email);
    if (currentAddress)
      update[EMP_FIELD_CURRENT_ADDRESS] = JdyUtil.setAddress({
        detail: currentAddress,
      });
    if (emergencyName)
      update[EMP_WIDGET_EMERGENCY_NAME] = JdyUtil.setText(emergencyName);
    if (emergencyRel)
      update[EMP_WIDGET_EMERGENCY_REL] = JdyUtil.setText(emergencyRel);
    if (emergencyPhone)
      update[EMP_FIELD_EMERGENCY_PHONE] = JdyUtil.setText(emergencyPhone);
    if (emergencyAddr)
      update[EMP_WIDGET_EMERGENCY_ADDR] = JdyUtil.setAddress({
        detail: emergencyAddr,
      });
    if (!Object.keys(update).length) return;
    await jdyFormDataApiClient.singleDataUpdate(
      EMP_APP_ID,
      EMP_ENTRY_ID,
      employeeArchiveId,
      update
    );
  }

  private parseCreatePayload(data: any) {
    const company = JdyUtil.getText(data[WIDGET_COMPANY]);

    const employeeName = JdyUtil.getText(data[WIDGET_EMPLOYEE_NAME]);
    const employeeId = JdyUtil.getText(data[WIDGET_EMPLOYEE_ID]);
    const employeeAddr = JdyUtil.getAddressText(data[WIDGET_EMPLOYEE_ADDR]);
    const employeePhone = JdyUtil.getText(data[WIDGET_EMPLOYEE_PHONE]);
    const employeeEmail = JdyUtil.getText(data[WIDGET_EMPLOYEE_EMAIL]);

    const emergencyRel = JdyUtil.getText(data[WIDGET_EMERGENCY_REL]);
    const emergencyName = JdyUtil.getText(data[WIDGET_EMERGENCY_NAME]);
    const emergencyPhone = JdyUtil.getText(data[WIDGET_EMERGENCY_PHONE]);
    const emergencyAddr = JdyUtil.getAddressText(data[WIDGET_EMERGENCY_ADDR]);
    const currentAddr = JdyUtil.getAddressText(data[WIDGET_CURRENT_ADDR]);

    const contractTerm = JdyUtil.getText(data[WIDGET_CONTRACT_TERM]);
    const fixedStart = JdyUtil.getDateText(data[WIDGET_FIXED_START]);
    const fixedEnd = JdyUtil.getDateText(data[WIDGET_FIXED_END]);
    const probationStart = JdyUtil.getDateText(data[WIDGET_PROBATION_START]);
    const probationEnd = JdyUtil.getDateText(data[WIDGET_PROBATION_END]);
    const openEnd = JdyUtil.getDateText(data[WIDGET_OPEN_END]);
    const taskTerm = JdyUtil.getDateText(data[WIDGET_TASK_TERM]);
    const taskMark = JdyUtil.getText(data[WIDGET_TASK_MARK]);
    const workLocation = JdyUtil.getText(data[WIDGET_WORK_LOCATION]);
    const workRole = JdyUtil.getText(data[WIDGET_WORK_ROLE]);
    const workTime = JdyUtil.getText(data[WIDGET_WORK_TIME]);
    const insurance = JdyUtil.getText(data[WIDGET_SOCIAL_SECURITY]);
    const signDate = JdyUtil.getDateText(data[WIDGET_SIGN_DATE]);

    const bizNo = JdyUtil.getText(data[WIDGET_BIZ_NO]);
    const selectedContracts = JdyUtil.getStringArray(
      data[WIDGET_CONTRACT_SELECT]
    );
    const needApprove = JdyUtil.getText(data[WIDGET_NEED_APPROVE]) === "需要";

    // Sender defaults to JDY initiator's username; fallback to employee phone.
    const initiator = JdyUtil.getUser(
      JdyUtil.getValue(data[WIDGET_INITIATOR]) as any
    );
    const senderAccount = initiator?.username ?? employeePhone;

    return {
      company,
      employeeName,
      employeeId,
      employeeAddr,
      employeePhone,
      employeeEmail,
      emergencyRel,
      emergencyName,
      emergencyPhone,
      emergencyAddr,
      currentAddr,
      contractTerm,
      fixedStart,
      fixedEnd,
      probationStart,
      probationEnd,
      openEnd,
      taskTerm,
      taskMark,
      workLocation,
      workRole,
      workTime,
      insurance,
      signDate,
      bizNo,
      selectedContracts,
      needApprove,
      initiator,
      senderAccount,
    };
  }

  private buildDocuments(selectedContracts: string[]) {
    // BestSign expects a fixed set of documents; `disabled` controls whether to include it.
    return [
      {
        documentId: CONTRACT_DOCUMENT_MAP.劳动合同,
        disabled: !selectedContracts.includes("劳动合同"),
      },
      {
        documentId: CONTRACT_DOCUMENT_MAP.保密合同,
        disabled: !selectedContracts.includes("保密合同"),
      },
      {
        documentId: CONTRACT_DOCUMENT_MAP.竞业协议,
        disabled: !selectedContracts.includes("竞业协议"),
      },
    ];
  }

  async handleBestSignOperationComplete(params: {
    record?: BestSignContractRecord | null;
    operationStatus?: string;
    roleName?: string;
    message?: string;
    contractId?: string;
    bizNo?: string;
  }) {
    const operationStatus = params.operationStatus;
    const roleName = params.roleName;
    const message = params.message ?? "";
    const contractId = params.contractId ?? params.record?.contractId ?? "";
    const bizNo = params.bizNo ?? params.record?.bizNo;

    if (!operationStatus) return;
    if (!params.record && !contractId && !bizNo) return;

    const record =
      params.record ??
      ((await BestSignContractRecord.findOne({
        where: contractId ? { contractId } : { bizNo },
      })) as BestSignContractRecord | null);
    if (!record?.jdyId) {
      logger.warn("HR contract: missing jdyId for OPERATION_COMPLETE", {
        contractId,
        bizNo,
        operationStatus,
      });
      return;
    }

    if (operationStatus === "REJECT") {
      const existingJdy = await jdyFormDataApiClient.singleDataQuery(
        APP_ID,
        ENTRY_ID,
        record.jdyId
      );
      const existingData = (existingJdy as any)?.data ?? existingJdy;
      const existingStatus = JdyUtil.getText(existingData?.[WIDGET_STATUS]);
      const existingReason = JdyUtil.getText(
        existingData?.[WIDGET_REJECT_REASON]
      );
      if (existingStatus === "拒签" && existingReason === message) {
        return;
      }
      await jdyFormDataApiClient.singleDataUpdate(
        APP_ID,
        ENTRY_ID,
        record.jdyId,
        {
          [WIDGET_STATUS]: JdyUtil.setText("拒签"),
          [WIDGET_REJECT_REASON]: JdyUtil.setText(message),
        }
      );
      return;
    }

    if (operationStatus === "SIGN_SUCCEED") {
      if (!record.afterSignUploaded) {
        const fileKeys =
          await bestSignContractService.uploadContractFilesToJdyUploadWidget({
            appId: APP_ID,
            entryId: ENTRY_ID,
            jdyId: record.jdyId,
            contractId: record.contractId,
            uploadWidgetKey: WIDGET_ATTACHMENT_AFTER_SIGN,
          });
        if (!fileKeys?.length) return;
        record.afterSignUploaded = true;
        await BestSignContractRecord.save(record);
      }

      // When BestSign notifies enterprise side sign, do not mark "乙方已签署" (party B signed).
      if (roleName !== "企业") {
        await jdyFormDataApiClient.singleDataUpdate(
          APP_ID,
          ENTRY_ID,
          record.jdyId,
          { [WIDGET_STATUS]: JdyUtil.setText("乙方已签署") }
        );

        // Sync signer-filled fields into employee archive after successful sign.
        await this.syncEmployeeArchiveFromOverview({
          contractId: record.contractId,
          contractJdyId: record.jdyId,
        });
      }
    }
  }

  /**
   * BestSign notifies CONTRACT_COMPLETE when the whole contract flow is complete.
   * For HR contracts we download and archive the final contract files into JDY.
   *
   * Notifications can be duplicated, so we must be idempotent (skip if already archived).
   */
  async handleBestSignContractComplete(params: {
    record?: BestSignContractRecord | null;
    contractId?: string;
    bizNo?: string;
  }) {
    const contractId = params.contractId ?? params.record?.contractId ?? "";
    const bizNo = params.bizNo ?? params.record?.bizNo;
    if (!params.record && !contractId && !bizNo) return;

    const record =
      params.record ??
      ((await BestSignContractRecord.findOne({
        where: contractId ? { contractId } : { bizNo },
      })) as BestSignContractRecord | null);
    if (!record?.jdyId) {
      logger.warn("HR contract: missing jdyId for CONTRACT_COMPLETE", {
        contractId,
        bizNo,
      });
      return;
    }

    if (!record.archiveUploaded) {
      const fileKeys =
        await bestSignContractService.uploadContractFilesToJdyUploadWidget({
          appId: APP_ID,
          entryId: ENTRY_ID,
          jdyId: record.jdyId,
          contractId: record.contractId,
          uploadWidgetKey: WIDGET_ATTACHMENT_ARCHIVE,
        });
      if (!fileKeys?.length) return;
      record.archiveUploaded = true;
      await BestSignContractRecord.save(record);
    }

    await jdyFormDataApiClient.singleDataUpdate(
      APP_ID,
      ENTRY_ID,
      record.jdyId,
      { [WIDGET_STATUS]: JdyUtil.setText("签署完成") }
    );
  }

  private async resolveContractIdForAction(params: {
    jdyId: string;
    bizNo: string;
    contractId: string;
  }) {
    if (params.contractId) return params.contractId;
    if (!params.bizNo) return "";
    const existing = await BestSignContractRecord.findOne({
      where: { bizNo: params.bizNo },
    });
    return existing?.contractId ?? "";
  }

  private async handleRemindAction(jdyId: string, contractId: string) {
    const remindResult = await bestSignContractService.remindContract(
      String(contractId)
    );
    const normalized =
      typeof remindResult === "string"
        ? (() => {
            try {
              return JSON.parse(remindResult);
            } catch {
              return null;
            }
          })()
        : (remindResult as any);
    if (normalized?.code !== "0") {
      logger.warn("HR contract: remind failed", {
        jdyId,
        contractId,
        result: normalized ?? remindResult,
      });
      return;
    }
    await jdyFormDataApiClient.singleDataUpdate(APP_ID, ENTRY_ID, jdyId, {
      [WIDGET_SIGN_ACTION]: JdyUtil.setText(SIGN_ACTION_NONE),
    });
  }

  private async handleApproveAction(params: {
    jdyId: string;
    bizNo: string;
    contractId: string;
    signAction: string;
  }) {
    const desired =
      params.signAction === SIGN_ACTION_APPROVE ? "true" : "false";
    const desiredStatus = desired === "true" ? "APPROVE_TRUE" : "APPROVE_FALSE";

    const record =
      (await BestSignContractRecord.findOne({
        where: { contractId: String(params.contractId) },
      })) ?? BestSignContractRecord.create();

    if (record.status === desiredStatus) {
      return;
    }

    const approveResult = await bestSignContractService.approveContract(
      desired,
      String(params.contractId)
    );
    const normalized =
      typeof approveResult === "string"
        ? (() => {
            try {
              return JSON.parse(approveResult);
            } catch {
              return null;
            }
          })()
        : (approveResult as any);

    if (normalized?.code !== "0") {
      logger.warn("HR contract: approveContract failed", {
        jdyId: params.jdyId,
        contractId: params.contractId,
        desired,
        result: normalized ?? approveResult,
      });
      return;
    }

    record.contractId = String(params.contractId);
    record.bizNo = params.bizNo || record.bizNo;
    record.jdyId = String(params.jdyId);
    record.status = desiredStatus;
    await BestSignContractRecord.save(record);

    await jdyFormDataApiClient.singleDataUpdate(
      APP_ID,
      ENTRY_ID,
      params.jdyId,
      {
        [WIDGET_STATUS]: JdyUtil.setText(
          desired === "true" ? "已发送" : "已取消"
        ),
        [WIDGET_SIGN_ACTION]: JdyUtil.setText(SIGN_ACTION_NONE),
      }
    );
  }

  private async handleSignAction(params: {
    jdyId: string;
    bizNo: string;
    contractId?: string;
  }) {
    const result = await bestSignContractService.signContract({
      bizNo: params.bizNo,
      contractId: params.contractId,
    });
    const normalized =
      typeof result === "string"
        ? (() => {
            try {
              return JSON.parse(result);
            } catch {
              return null;
            }
          })()
        : (result as any);
    if (normalized?.code !== "0") {
      logger.warn("HR contract: sign failed", {
        jdyId: params.jdyId,
        bizNo: params.bizNo,
        result: normalized ?? result,
      });
      return;
    }
    await jdyFormDataApiClient.singleDataUpdate(
      APP_ID,
      ENTRY_ID,
      params.jdyId,
      {
        [WIDGET_SIGN_ACTION]: JdyUtil.setText(SIGN_ACTION_NONE),
        [WIDGET_STATUS]: JdyUtil.setText("签署完成"),
      }
    );
  }

  private async handleRejectSignAction(params: {
    jdyId: string;
    contractId: string;
    resignMark: string;
    userAccount: string;
  }) {
    if (!params.userAccount) {
      logger.warn("HR contract: reject missing userAccount (signer phone)", {
        jdyId: params.jdyId,
        contractId: params.contractId,
      });
      return;
    }
    const result = await bestSignContractService.rejectContract(
      params.contractId,
      params.resignMark,
      undefined,
      params.userAccount
    );
    const normalized =
      typeof result === "string"
        ? (() => {
            try {
              return JSON.parse(result);
            } catch {
              return null;
            }
          })()
        : (result as any);
    if (
      normalized?.code &&
      !["0", "ALREADY_REJECTED"].includes(String(normalized.code))
    ) {
      logger.warn("HR contract: reject failed", {
        jdyId: params.jdyId,
        contractId: params.contractId,
        result: normalized ?? result,
      });
      return;
    }
    await jdyFormDataApiClient.singleDataUpdate(
      APP_ID,
      ENTRY_ID,
      params.jdyId,
      {
        [WIDGET_SIGN_ACTION]: JdyUtil.setText(SIGN_ACTION_NONE),
        [WIDGET_STATUS]: JdyUtil.setText("重新签署"),
      }
    );

    // Reset idempotency flags so the next SIGN_SUCCEED can re-upload attachments.
    const record = await BestSignContractRecord.findOne({
      where: { contractId: String(params.contractId) },
    });
    if (record) {
      record.afterSignUploaded = false;
      record.archiveUploaded = false;
      await BestSignContractRecord.save(record);
    }
  }

  private async handleRevokeAction(params: {
    jdyId: string;
    contractId: string;
  }) {
    const result = await bestSignContractService.revokeContract(
      params.contractId,
      ""
    );
    const normalized =
      typeof result === "string"
        ? (() => {
            try {
              return JSON.parse(result);
            } catch {
              return null;
            }
          })()
        : (result as any);
    if (normalized?.code !== "0") {
      logger.warn("HR contract: revoke failed", {
        jdyId: params.jdyId,
        contractId: params.contractId,
        result: normalized ?? result,
      });
      return;
    }
    await jdyFormDataApiClient.singleDataUpdate(
      APP_ID,
      ENTRY_ID,
      params.jdyId,
      {
        [WIDGET_SIGN_ACTION]: JdyUtil.setText(SIGN_ACTION_NONE),
        [WIDGET_STATUS]: JdyUtil.setText("已撤回"),
      }
    );
  }

  async handleUpdate(data: any) {
    if (!data) return;
    const jdyId = data[JDY_ID_FIELD];
    if (!jdyId) return;

    const signAction = JdyUtil.getText(data[WIDGET_SIGN_ACTION]);
    if (
      ![
        SIGN_ACTION_APPROVE,
        SIGN_ACTION_APPROVAL_REJECT,
        SIGN_ACTION_REMIND,
        SIGN_ACTION_SIGN,
        SIGN_ACTION_REJECT_SIGN,
        SIGN_ACTION_REVOKE,
      ].includes(signAction)
    ) {
      return;
    }

    // data_update handler for sign actions (approve/reject/remind).
    const bizNo = JdyUtil.getText(data[WIDGET_BIZ_NO]);
    const contractId = await this.resolveContractIdForAction({
      jdyId,
      bizNo,
      contractId: JdyUtil.getText(data[WIDGET_CONTRACT_ID]),
    });
    if (!contractId) {
      logger.warn("HR contract: missing contractId for approve action", {
        jdyId,
        bizNo,
        signAction,
      });
      return;
    }

    if (signAction === SIGN_ACTION_REMIND) {
      await this.handleRemindAction(jdyId, contractId);
      return;
    }

    if (signAction === SIGN_ACTION_SIGN) {
      await this.handleSignAction({ jdyId, bizNo, contractId });
      return;
    }

    if (signAction === SIGN_ACTION_REJECT_SIGN) {
      const resignMark = JdyUtil.getText(data[WIDGET_RESIGN_MARK]);
      let userAccount = JdyUtil.getText(data[WIDGET_EMPLOYEE_PHONE]);
      if (!userAccount) {
        // data_update payload may be partial; fallback to read current JDY record.
        const existing = await jdyFormDataApiClient.singleDataQuery(
          APP_ID,
          ENTRY_ID,
          jdyId
        );
        const existingData = (existing as any)?.data ?? existing;
        userAccount = JdyUtil.getText(existingData?.[WIDGET_EMPLOYEE_PHONE]);
      }
      await this.handleRejectSignAction({
        jdyId,
        contractId,
        resignMark,
        userAccount,
      });
      return;
    }

    if (signAction === SIGN_ACTION_REVOKE) {
      await this.handleRevokeAction({ jdyId, contractId });
      return;
    }

    await this.handleApproveAction({ jdyId, bizNo, contractId, signAction });
  }

  async handleCreate(data: any) {
    if (!data) return;
    const jdyId = data[JDY_ID_FIELD];
    if (!jdyId) return;

    // If contractId already exists, this record is likely imported/backfilled from BestSign overview.
    // Skip sending to avoid creating duplicate contracts.
    const existingContractId = JdyUtil.getText(data[WIDGET_CONTRACT_ID]);
    if (existingContractId) {
      logger.info("HR contract: skip create, contractId already exists", {
        jdyId,
        contractId: existingContractId,
      });
      return;
    }

    // data_create handler: create BestSign contract from JDY form data.
    const parsed = this.parseCreatePayload(data);
    const {
      company,
      employeeName,
      employeeId,
      employeeAddr,
      contractTerm,
      fixedStart,
      fixedEnd,
      probationStart,
      probationEnd,
      openEnd,
      taskTerm,
      taskMark,
      workLocation,
      workRole,
      workTime,
      insurance,
      signDate,
      employeeEmail,
      employeePhone,
      emergencyRel,
      emergencyName,
      emergencyPhone,
      emergencyAddr,
      currentAddr,
      bizNo,
      selectedContracts,
      needApprove,
      initiator,
      senderAccount,
    } = parsed;

    const enterpriseConfig = getEnterpriseConfig(company);
    const companyAddress = enterpriseConfig?.address ?? "";
    const legalRepresentative = enterpriseConfig?.legalRepresentative ?? "";
    const postalCode = enterpriseConfig?.postalCode ?? "";

    const textLabels = [
      { name: "公司", value: company },
      { name: "公司地址", value: companyAddress },
      { name: "法定代表人", value: legalRepresentative },
      { name: "公司邮政编码", value: postalCode },
      { name: "员工姓名", value: employeeName },
      { name: "员工身份证", value: employeeId },
      { name: "员工地址", value: employeeAddr },
      { name: "合同期限", value: contractTerm },
      { name: "固定期限1", value: fixedStart },
      { name: "固定期限2", value: fixedEnd },
      { name: "试用期1", value: probationStart },
      { name: "试用期2", value: probationEnd },
      { name: "无固定期限", value: openEnd },
      { name: "任务期限", value: taskTerm },
      { name: "任务完成标志", value: taskMark },
      { name: "工作地点", value: workLocation },
      { name: "工作岗位", value: workRole },
      { name: "工时制度", value: workTime },
      { name: "保险", value: insurance },
      { name: "签署日期", value: signDate },
    ];

    const signTextLabels = [
      { name: "员工邮箱", defaultValue: employeeEmail },
      { name: "法律文书寄送地址（现住址）", defaultValue: currentAddr },
      { name: "员工手机号", defaultValue: employeePhone },
      { name: "紧急联系人电话", defaultValue: emergencyPhone },
      { name: "紧急联系人姓名", defaultValue: emergencyName },
      { name: "紧急联系人关系", defaultValue: emergencyRel },
      { name: "紧急联系人地址", defaultValue: emergencyAddr },
    ].filter((item) => item.defaultValue);

    const templateId = "3364564979671753730";

    const params = await bestSignTemplateTextLabelService.getParamsByTemplateId(
      templateId
    );
    const mergedTextLabels = mergeTextLabels(
      params?.textLabels ?? [],
      textLabels
    );

    const roles = (params?.roles ?? []).map((role) => ({
      roleId: role.roleid,
      userInfo: role.is_ent
        ? { enterpriseName: company, account: "18857608003" }
        : {
            enterpriseName: undefined,
            userName: employeeName,
            userAccount: employeePhone,
          },
    }));
    const documents = this.buildDocuments(selectedContracts);
    const hasEnabledDocument = documents.some((item) => !item.disabled);
    if (!hasEnabledDocument) {
      logger.warn("HR contract: no selected contracts, skip send", {
        jdyId,
        templateId,
      });
      return;
    }
    if (!employeeName || !employeePhone) {
      logger.warn("HR contract: missing employee name or phone", { jdyId });
      return;
    }
    if (roles.length === 0) {
      logger.warn("HR contract: missing roles", { jdyId, templateId });
      return;
    }

    const sendAction: "APPROVE" | "SEND" = needApprove ? "APPROVE" : "SEND";

    logger.info("HR contract: sending contract", {
      jdyId,
      templateId,
      sendAction,
    });
    const payload = {
      templateId,
      sender: {
        enterpriseName: company,
        // account: '18357683677',
        account: senderAccount,
      },
      roles,
      enabledDocumentIds: [],
      documents,
      textLabels: mergedTextLabels,
      bizNo,
      signTextLabels,
      sendAction,
    };

    const result = await bestSignContractService.sendContractByTemplate(
      payload,
      {
        senderName: initiator?.name,
        senderPhone: senderAccount,
        jdyId,
      }
    );

    const contractId =
      (result as any)?.data?.contractId ?? (result as any)?.data?.draftId;

    const updateData: Record<string, any> = {
      [WIDGET_STATUS]: JdyUtil.setText(needApprove ? "发送前检查" : "已发送"),
    };

    if (contractId) {
      updateData[WIDGET_CONTRACT_ID] = JdyUtil.setText(String(contractId));
    }

    if (needApprove && contractId) {
      await bestSignContractService.uploadContractFilesToJdyUploadWidget({
        appId: APP_ID,
        entryId: ENTRY_ID,
        jdyId: String(jdyId),
        contractId: String(contractId),
        uploadWidgetKey: WIDGET_ATTACHMENT_BEFORE,
        fileNameFallback: `contract_${bizNo ?? jdyId}.pdf`,
      });
    }

    // await jdyFormDataApiClient.singleDataUpdate(
    //   APP_ID,
    //   ENTRY_ID,
    //   jdyId,
    //   updateData
    // );
  }
}

export const hrContractService = new HrContractService();
