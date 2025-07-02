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
export function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  const distance = levenshtein(a, b);
  return (len - distance) / len;
}
