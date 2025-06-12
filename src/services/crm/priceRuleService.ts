import { PriceRule } from "../../entity/crm/priceRule";

class PriceRuleService {
  async getRules() {
    return await PriceRule.find();
  }

  async createRule(rule: Partial<PriceRule>) {
    const entity = PriceRule.create(rule);
    return await entity.save();
  }

  async updateRule(ruleId: string | number, rule: Partial<PriceRule>) {
    const id = Number(ruleId);
    await PriceRule.update({ id }, rule);
    return await PriceRule.findOne({ where: { id } });
  }

  async deleteRule(ruleId: string | number) {
    const id = Number(ruleId);
    return await PriceRule.delete({ id });
  }
}

export const priceRuleService = new PriceRuleService();
