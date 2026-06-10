export type BestSignEnterpriseConfig = {
  address: string;
  legalRepresentative: string;
  postalCode: string;
  sealName: string;
  signerAccount?: string;
};

export const bestSignEnterpriseConfig: Record<
  string,
  BestSignEnterpriseConfig
> = {
  浙江精艺智造科技有限公司: {
    address: "浙江省台州市黄岩区澄江街道香女路3号",
    legalRepresentative: "梁斌",
    postalCode: "318020",
    sealName: "电子公章",
    signerAccount: "18869965222",
  },
  浙江精诚时代科技股份有限公司: {
    address: "浙江省台州市黄岩区新前街道建业路88号",
    legalRepresentative: "梁斌",
    postalCode: "318020",
    sealName: "电子公章",
  },
};

export const getEnterpriseConfig = (enterpriseName?: string) => {
  if (!enterpriseName) return null;
  return bestSignEnterpriseConfig[enterpriseName] ?? null;
};

export const getSealNameByEnterprise = (enterpriseName?: string) => {
  const config = getEnterpriseConfig(enterpriseName);
  return config?.sealName ?? "公章";
};

export const getSignerAccountByEnterprise = (enterpriseName?: string) => {
  const config = getEnterpriseConfig(enterpriseName);
  return config?.signerAccount;
};
