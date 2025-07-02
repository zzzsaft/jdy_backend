import qs from "querystring";
export const createWechatUrl = (redirectUrl: string) => {
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=${qs.escape(
    redirectUrl
  )}&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect`;
};

export function removeUndefined(obj) {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      value === undefined ? undefined : value
    )
  );
}

interface Ratio {
  rear: number | null;
  front: number;
  unit: string;
  value: string;
}

interface LevelItem {
  level: string;
  ratio: Ratio;
}

export function parseRatioString(input: string): LevelItem[] {
  // 分割字符串获取各部分数值
  const parts = input.split(":").map((part) => parseInt(part, 10));

  // 计算总和
  const total = parts.reduce((sum, num) => sum + num, 0);

  // 确定等级标签 (a, b, c...)
  const levels = "abcdefghijklmnopqrstuvwxyz".split("");

  // 创建结果数组
  const result: LevelItem[] = [];

  for (let i = 0; i < parts.length; i++) {
    // 计算实际比例（如果总和不是100，则按比例加权）
    const actualRatio =
      total === 100 ? parts[i] : Math.round((parts[i] / total) * 100);

    result.push({
      level: levels[i],
      ratio: {
        rear: null,
        front: actualRatio,
        unit: "%",
        value: actualRatio.toString(),
      },
    });
  }

  return result;
}
