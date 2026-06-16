import type { AgentRuntimeRouteDecision } from "./types.js";

export function routeAgentRuntimeMessage(message: string): AgentRuntimeRouteDecision {
  const normalized = message.trim().toLowerCase();

  if (
    matches(normalized, [
      "配置表",
      "产品配置",
      "产品型号",
      "过滤器",
      "计量泵",
      "字段",
      "参数",
      "历史配置",
      "product config",
      "product configuration",
      "configure product",
      "filter",
      "metering pump",
    ])
  ) {
    return {
      agentType: "productConfigAgent",
      confidence: 0.86,
      reason: "message mentions product configuration concepts",
      needsClarification: false,
    };
  }

  if (
    matches(normalized, [
      "商机",
      "销售阶段",
      "客户跟进",
      "跟进记录",
      "上传简道云商机",
      "opportunity",
      "sales",
      "lead",
    ])
  ) {
    return {
      agentType: "salesAgent",
      confidence: 0.82,
      reason: "message mentions sales opportunity concepts",
      needsClarification: false,
    };
  }

  if (
    matches(normalized, [
      "报价",
      "价格",
      "折扣",
      "利润",
      "报价单",
      "quote",
      "price",
      "discount",
    ])
  ) {
    return {
      agentType: "quoteAgent",
      confidence: 0.82,
      reason: "message mentions quote or pricing concepts",
      needsClarification: false,
    };
  }

  if (
    matches(normalized, [
      "同步",
      "上传",
      "写入简道云",
      "表单",
      "jdy",
      "jiandaoyun",
      "upload",
      "sync",
    ])
  ) {
    return {
      agentType: "jdyUploadAgent",
      confidence: 0.78,
      reason: "message mentions upload or Jiandaoyun form concepts",
      needsClarification: false,
    };
  }

  return {
    agentType: "generalAgent",
    confidence: 0.3,
    reason: "no high-confidence agent route matched",
    needsClarification: true,
    clarificationMessage: "你是想生成产品配置表，还是基于配置表创建销售商机/报价/简道云任务？",
  };
}

function matches(message: string, keywords: string[]): boolean {
  return keywords.some((keyword) => message.includes(keyword.toLowerCase()));
}
