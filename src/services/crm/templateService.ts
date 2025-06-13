import { CrmTemplate } from "../../entity/crm/template";

class TemplateService {
  async getTemplates(params?: { formType?: string }) {
    const where: any = {};
    if (params?.formType) {
      where.templateType = params.formType;
    }
    return await CrmTemplate.find({ where });
  }

  async getTemplate(id: string | number) {
    return await CrmTemplate.findOne({ where: { id: Number(id) } });
  }

  async createTemplate(data: Partial<CrmTemplate>) {
    const entity = CrmTemplate.create(data);
    return await entity.save();
  }

  async updateTemplate(id: string | number, data: Partial<CrmTemplate>) {
    const templateId = Number(id);
    await CrmTemplate.update({ id: templateId }, data);
    return await CrmTemplate.findOne({ where: { id: templateId } });
  }

  async deleteTemplate(id: string | number) {
    const templateId = Number(id);
    return await CrmTemplate.delete({ id: templateId });
  }
}

export const templateService = new TemplateService();
