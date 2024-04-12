import { LimiterSet } from "../src/config/limiter";

// 测试代码
async function testLimiterSet() {
  const limiterSet = new LimiterSet(1000, 3); // 设置全局限速器，每秒最多执行3次

  // 两个操作共享一个名为 "operation" 的限速器，每秒最多执行2次
  const limitOption1 = { name: "operation", duration: 1000, limit: 2 };
  const limitOption2 = { name: "operation", duration: 1000, limit: 2 };

  // 全局限速器生效
  await limiterSet.tryBeforeRun({ name: "global", duration: 1000, limit: 1 });
  await limiterSet.tryBeforeRun({ name: "global", duration: 1000, limit: 1 });
  await limiterSet.tryBeforeRun({ name: "global", duration: 1000, limit: 1 });

  // 名为 "operation" 的限速器生效
  await limiterSet.tryBeforeRun(limitOption1);
  await limiterSet.tryBeforeRun(limitOption1);
  await limiterSet.tryBeforeRun(limitOption1);

  // 再次尝试，已达到限速
  await limiterSet.tryBeforeRun(limitOption1);

  // 另一个名为 "operation" 的限速器生效
  await limiterSet.tryBeforeRun(limitOption2);
}

testLimiterSet();
