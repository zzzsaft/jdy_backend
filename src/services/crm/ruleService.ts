import { QuoteRule } from "../../entity/crm/quoteRule";
import { Quote, QuoteItem } from "../../entity/crm/quote";
import _ from "lodash";

class RuleService {
  async getRules(type?: string) {
    const where = type ? { ruleType: type } : {};
    return await QuoteRule.find({ where, order: { priority: "ASC" } });
  }

  async createRule(rule: Partial<QuoteRule>) {
    const entity = QuoteRule.create(rule);
    return await entity.save();
  }

  async updateRule(ruleId: string | number, rule: Partial<QuoteRule>) {
    const id = Number(ruleId);
    await QuoteRule.update({ id }, rule);
    return await QuoteRule.findOne({ where: { id } });
  }

  async deleteRule(ruleId: string | number) {
    const id = Number(ruleId);
    return await QuoteRule.delete({ id });
  }

  private evalCondition(
    cond: { field: string; operator: string; value?: string },
    context: any
  ) {
    const value = _.get(context, cond.field);
    const compare = cond.value;
    const valNum = Number(value);
    const cmpNum = Number(compare);
    const bothNumber =
      value !== null && value !== undefined &&
      compare !== undefined &&
      !Number.isNaN(valNum) &&
      !Number.isNaN(cmpNum);
    switch (cond.operator) {
      case "=":
        return bothNumber ? valNum === cmpNum : String(value) == String(compare);
      case ">":
        return bothNumber ? valNum > cmpNum : false;
      case "<":
        return bothNumber ? valNum < cmpNum : false;
      case "contains":
        return Array.isArray(value)
          ? value.includes(compare)
          : String(value ?? "").includes(String(compare));
      default:
        return false;
    }
  }

  private matchRule(rule: QuoteRule, quote: Quote, item?: QuoteItem) {
    if (!rule.active) return false;
    const context: any = item || quote;
    if (rule.productCategory && rule.productCategory.length && item) {
      if (!item.productCategory) return false;
      const matched = rule.productCategory.every((c) =>
        item.productCategory.includes(c)
      );
      if (!matched) return false;
    }
    if (rule.conditions && rule.conditions.length) {
      const results = rule.conditions.map((c) => this.evalCondition(c, context));
      return rule.relation === "or"
        ? results.some(Boolean)
        : results.every(Boolean);
    }
    // If no conditions are defined the rule always matches
    return true;
  }

  async applyRules(quote: Quote) {
    const priceRules = await this.getRules("price");
    const gradeRules = await this.getRules("grade");
    const deliveryRules = await this.getRules("delivery");

    if (quote.items) {
      quote.items.forEach((item) => {
        for (const rule of priceRules) {
          if (this.matchRule(rule, quote, item)) {
            if (rule.step) {
              const qty = Number(item.quantity) || 0;
              item.unitPrice = Math.ceil(qty / rule.step.interval) * rule.step.amount;
            } else if (rule.addition) {
              item.unitPrice = (Number(item.unitPrice) || 0) + Number(rule.addition);
            }
          }
        }
      });
    }

    for (const rule of gradeRules) {
      if (this.matchRule(rule, quote)) {
        if (rule.grade) quote.projectLevel = rule.grade;
        break;
      }
    }

    for (const rule of deliveryRules) {
      if (this.matchRule(rule, quote)) {
        if (rule.deliveryDays != null) quote.deliveryDays = rule.deliveryDays;
        break;
      }
    }
  }
}

export const ruleService = new RuleService();
