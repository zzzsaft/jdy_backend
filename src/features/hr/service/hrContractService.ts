import { logger } from "../../../config/logger";
import { JdyUtil } from "../../../utils/jdyUtils";
import { jdyFormDataApiClient } from "../../jdy/api/form_data";
import fileApiClient from "../../jdy/api/file";
import { bestSignContractService } from "../../bestsign/service/bestSignContractService";
import { bestSignTemplateTextLabelService } from "../../bestsign/service/bestSignTemplateTextLabelService";

const APP_ID = "5cfef4b5de0b2278b05c8380";
const ENTRY_ID = "64b915fe3b3b7c0008316594";

const WIDGET_STATUS = "_widget_1690168915559";
const WIDGET_INITIATOR = "_widget_1690479795030";
const WIDGET_COMPANY = "_widget_1690040348992";
const WIDGET_CONTRACT_SELECT = "_widget_1690006804708";
const WIDGET_SIGN_DATE = "_widget_1690006804710";
const WIDGET_BIZ_NO = "_widget_1690040348928";
const WIDGET_NEED_APPROVE = "_widget_1690040348942";
const WIDGET_ATTACHMENT_BEFORE = "_widget_1690040348941";
const WIDGET_CONTRACT_ID = "_widget_1690432688885";
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

const JDY_ID_FIELD = "_id";

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

const resolveTemplateId = (value: any): string => {
  const resolved = JdyUtil.getValue(value);
  if (Array.isArray(resolved)) return String(resolved[0] ?? "");
  return resolved ? String(resolved) : "";
};

const resolveUploadKey = (payload: any): string | null => {
  if (!payload) return null;
  const key =
    payload.key ??
    payload.file_key ??
    payload.fileKey ??
    payload.data?.key ??
    payload.data?.file_key ??
    payload.data?.fileKey;
  return typeof key === "string" && key.length > 0 ? key : null;
};

class HrContractService {
  async handleCreate(data: any) {
    if (!data) return;
    const jdyId = data[JDY_ID_FIELD];
    if (!jdyId) return;

    const company = JdyUtil.getText(data[WIDGET_COMPANY]);
    const employeeName = JdyUtil.getText(data[WIDGET_EMPLOYEE_NAME]);
    const employeeId = JdyUtil.getText(data[WIDGET_EMPLOYEE_ID]);
    const employeeAddr = JdyUtil.getAddressText(data[WIDGET_EMPLOYEE_ADDR]);
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

    const employeeEmail = JdyUtil.getText(data[WIDGET_EMPLOYEE_EMAIL]);
    const employeePhone = JdyUtil.getText(data[WIDGET_EMPLOYEE_PHONE]);
    const emergencyRel = JdyUtil.getText(data[WIDGET_EMERGENCY_REL]);
    const emergencyName = JdyUtil.getText(data[WIDGET_EMERGENCY_NAME]);
    const emergencyPhone = JdyUtil.getText(data[WIDGET_EMERGENCY_PHONE]);
    const emergencyAddr = JdyUtil.getAddressText(data[WIDGET_EMERGENCY_ADDR]);
    const currentAddr = JdyUtil.getAddressText(data[WIDGET_CURRENT_ADDR]);

    const textLabels = [
      { name: "公司", value: company },
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

    const templateId = resolveTemplateId(data[WIDGET_CONTRACT_SELECT]);
    if (!templateId) {
      logger.warn("HR contract: missing templateId", { jdyId });
      return;
    }
    const selectedContracts = JdyUtil.getStringArray(
      data[WIDGET_CONTRACT_SELECT]
    );

    const params = await bestSignTemplateTextLabelService.getParamsByTemplateId(
      templateId
    );
    const mergedTextLabels = mergeTextLabels(
      params?.textLabels ?? [],
      textLabels
    );

    const roles = (params?.roles ?? []).map((role) => ({
      roleId: role.roleid,
      userInfo: {
        enterpriseName: role.is_ent ? company : undefined,
        userName: employeeName,
        userAccount: employeePhone,
      },
    }));
    const documents = (params?.documents ?? []).map((doc) => ({
      documentId: doc.documentId,
      disabled: selectedContracts.includes(doc.name),
    }));
    if (!documents.length) {
      logger.warn("HR contract: documents empty, skip send", {
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

    const bizNo = JdyUtil.getText(data[WIDGET_BIZ_NO]);

    const initiator = JdyUtil.getUser(
      JdyUtil.getValue(data[WIDGET_INITIATOR]) as any
    );
    const senderAccount = initiator?.username ?? employeePhone;

    const needApprove = JdyUtil.getText(data[WIDGET_NEED_APPROVE]) === "需要";
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
      const downloadResult =
        await bestSignContractService.downloadContractFiles(
          [String(contractId)],
          { saveLocal: false }
        );
      const extracted = (downloadResult as any)?.extractedData ?? {};
      const firstKey = Object.keys(extracted)[0];
      const fileList = firstKey ? extracted[firstKey] : [];
      const file = fileList?.[0];
      if (file?.content) {
        const uploadResult = await fileApiClient.uploadBuffer(
          APP_ID,
          ENTRY_ID,
          file.name ?? `contract_${bizNo ?? jdyId}.pdf`,
          file.content
        );
        const fileKey = resolveUploadKey(uploadResult);
        if (fileKey) {
          updateData[WIDGET_ATTACHMENT_BEFORE] = { value: [fileKey] };
        }
      }
    }

    await jdyFormDataApiClient.singleDataUpdate(
      APP_ID,
      ENTRY_ID,
      jdyId,
      updateData
    );
  }
}

export const hrContractService = new HrContractService();
