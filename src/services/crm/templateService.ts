import { CrmTemplate } from "../../entity/crm/template";

class TemplateService {
  async getTemplates(params?: {
    formType?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { formType, page = 1, pageSize = 20 } = params || {};
    const query = CrmTemplate.createQueryBuilder("template");
    if (formType) {
      query.where("template.templateType = :formType", { formType });
    }
    const [list, total] = await query
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { list, total };
  }

  async getTemplate(id: string | number) {
    return await CrmTemplate.findOne({ where: { id: Number(id) } });
  }

  async createTemplate(data: Partial<CrmTemplate>, userid: string) {
    const entity = CrmTemplate.create({ creatorId: userid, ...data });
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
