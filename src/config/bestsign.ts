export const bestSignSealConfig: Record<string, string> = {
  // "公司名": "印章名",
};

export const getSealNameByEnterprise = (enterpriseName?: string) => {
  if (!enterpriseName) return "公章";
  return bestSignSealConfig[enterpriseName] ?? "公章";
};
