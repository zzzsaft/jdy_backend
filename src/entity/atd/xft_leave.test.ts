import assert from "node:assert/strict";
import { XftAtdLeave } from "./xft_leave.js";

async function testDepartmentLeaveUsersAreCountedByRequestedDay() {
  const originalCreateQueryBuilder = (XftAtdLeave as any).createQueryBuilder;
  const calls: string[] = [];
  const query = {
    where() {
      calls.push("where");
      return this;
    },
    andWhere() {
      calls.push("andWhere");
      return this;
    },
    async getMany() {
      calls.push("getMany");
      return [
        {
          stfSeq: "u1",
          begDate: new Date("2026-06-15T08:00:00"),
          endDate: new Date("2026-06-16T18:00:00"),
        },
        {
          stfSeq: "u1",
          begDate: new Date("2026-06-16T09:00:00"),
          endDate: new Date("2026-06-16T17:00:00"),
        },
        {
          stfSeq: "u2",
          begDate: new Date("2026-06-16T09:00:00"),
          endDate: new Date("2026-06-16T17:00:00"),
        },
      ];
    },
  };

  try {
    (XftAtdLeave as any).createQueryBuilder = () => query;
    const counts = await XftAtdLeave.countDepartmentLeaveUsersByDates(
      "dept-1",
      [new Date("2026-06-15T00:00:00"), new Date("2026-06-16T00:00:00")],
    );

    assert.equal(calls.filter((item) => item === "getMany").length, 1);
    assert.equal(counts.get("2026-06-15"), 1);
    assert.equal(counts.get("2026-06-16"), 2);
  } finally {
    (XftAtdLeave as any).createQueryBuilder = originalCreateQueryBuilder;
  }
}

await testDepartmentLeaveUsersAreCountedByRequestedDay();
console.log("xft leave tests passed");
