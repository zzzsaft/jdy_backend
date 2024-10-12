import cron from "node-cron";
import parser from "cron-parser";

export const testCron = async () => {
  // Cron 表达式
  const cronExpression = "0 0 9,16 1/1 * ?"; // 每分钟的第0秒触发

  // 使用 cron-parser 解析表达式
  const interval = parser.parseExpression(cronExpression);

  // 获取并输出未来 20 次的运行时间
  console.log("Next 20 cron run times:");
  for (let i = 0; i < 50; i++) {
    const nextDate = interval.next();
    console.log(`${i + 1}: ${nextDate.toString()}`);
  }
};
