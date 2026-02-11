import { logger } from "../../../config/logger";
import { JdyUtil } from "../../../utils/jdyUtils";
import { BestSignTemplateTextLabel } from "../entity/templateTextLabel";

const TEMPLATE_ID_WIDGET = "_widget_1770461708074";
const TEMPLATE_NAME_WIDGET = "_widget_1770461708075";
const TEXT_LABELS_WIDGET = "_widget_1770461708076";
const LABEL_NAME_WIDGET = "_widget_1770461708080";
const LABEL_VALUE_WIDGET = "_widget_1770461708081";
const ROLES_WIDGET = "_widget_1770470619348";
const ROLE_ID_WIDGET = "_widget_1770470619350";
const ROLE_IS_ENT_WIDGET = "_widget_1770470619351";
const DOCUMENTS_WIDGET = "_widget_1770470619359";
const DOCUMENT_NAME_WIDGET = "_widget_1770470619362";
const DOCUMENT_ID_WIDGET = "_widget_1770470619361";
const JDY_ID_FIELD = "_id";

const resolveRecord = (payload: any) => {
  if (!payload) return null;
  if (payload.data && typeof payload.data === "object") return payload.data;
  return payload;
};

const resolveSubformRows = (value: any): any[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") {
    if (Array.isArray(value.value)) return value.value;
    if (Array.isArray(value.items)) return value.items;
  }
  const normalized = JdyUtil.getSubForm(value?.value ?? value);
  return Array.isArray(normalized) ? normalized : [];
};

class BestSignTemplateTextLabelService {
  async syncFromJdy(payload: any) {
    const record = resolveRecord(payload);
    if (!record) return;

    const jdyId = JdyUtil.getText(record[JDY_ID_FIELD]);
    if (!jdyId) {
      logger.warn("BestSign textLabels sync skipped: missing jdyid");
      return;
    }

    const templateId = JdyUtil.getText(record[TEMPLATE_ID_WIDGET]);
    if (!templateId) {
      logger.warn("BestSign textLabels sync skipped: missing templateId", {
        jdyId,
      });
      return;
    }
    const templateName = JdyUtil.getText(record[TEMPLATE_NAME_WIDGET]);

    const rows = resolveSubformRows(record[TEXT_LABELS_WIDGET]);
    const textLabels = rows
      .map((row) => {
        const name = JdyUtil.getText(row?.[LABEL_NAME_WIDGET]);
        const value = JdyUtil.getText(row?.[LABEL_VALUE_WIDGET]);
        if (!name && !value) return null;
        return { name, value };
      })
      .filter(Boolean) as Array<{ name: string; value: string }>;

    const roleRows = resolveSubformRows(record[ROLES_WIDGET]);
    const roles = roleRows
      .map((row) => {
        const roleid = JdyUtil.getText(row?.[ROLE_ID_WIDGET]);
        if (!roleid) return null;
        const isEntRaw = JdyUtil.getText(row?.[ROLE_IS_ENT_WIDGET]);
        const is_ent = isEntRaw === "是";
        return { roleid, is_ent };
      })
      .filter(Boolean) as Array<{ roleid: string; is_ent: boolean }>;

    const documentRows = resolveSubformRows(record[DOCUMENTS_WIDGET]);
    const documents = documentRows
      .map((row) => {
        const name = JdyUtil.getText(row?.[DOCUMENT_NAME_WIDGET]);
        const documentId = JdyUtil.getText(row?.[DOCUMENT_ID_WIDGET]);
        if (!name || !documentId) return null;
        return { name, documentId };
      })
      .filter(Boolean) as Array<{ name: string; documentId: string }>;

    const entity = BestSignTemplateTextLabel.create({
      jdyId,
      templateId,
      templateName,
      textLabels,
      roles,
      documents,
    });

    await BestSignTemplateTextLabel.upsert(entity, ["jdyId"]);

    logger.info("BestSign contract params sync: saved row", {
      jdyId,
      templateId,
    });
  }

  async removeByJdyPayload(payload: any) {
    const record = resolveRecord(payload);
    if (!record) return;
    const jdyId =
      JdyUtil.getText(record[JDY_ID_FIELD]) ||
      JdyUtil.getText(record["dataId"]);
    if (!jdyId) return;
    await BestSignTemplateTextLabel.delete({ jdyId });
    logger.info("BestSign contract params sync: removed row", { jdyId });
  }

  async getParamsByTemplateId(templateId: string) {
    if (!templateId) return null;
    const row = await BestSignTemplateTextLabel.findOne({
      where: { templateId },
    });
    if (!row) return null;
    return {
      textLabels: row.textLabels ?? [],
      roles: row.roles ?? [],
      documents: row.documents ?? [],
    };
  }
}

export const bestSignTemplateTextLabelService =
  new BestSignTemplateTextLabelService();
