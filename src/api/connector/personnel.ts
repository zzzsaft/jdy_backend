import { randomUUID } from "node:crypto";
import { connectorJSON } from "./client.js";

export const personnelSyncInConnect = () => process.env.PERSONNEL_SYNC_OWNER === "connect";

export async function forwardXFTOnboarding(data: unknown): Promise<unknown> {
  return connectorJSON("/v1/providers/personnel/jdy-events", {
    appId: "5cfef4b5de0b2278b05c8380", entryId: "5cfef54d0fc84505a1d270f4",
    operation: "xft-onboarding", data,
  });
}

/** Keep OA's trigger and await completion before dependent attendance work. */
export async function runPersonnelSync(operation: string, corpId?: string, key = randomUUID()): Promise<void> {
  let job = await connectorJSON("/v1/providers/personnel/jobs", { key, operation, apply: true, ...(corpId ? { corpId } : {}) });
  const deadline = Date.now() + 21 * 60 * 1000;
  while (job.status === "running") {
    if (Date.now() >= deadline) throw new Error("Connect personnel job still running; reconcile before resubmitting");
    await new Promise(resolve => setTimeout(resolve, 2000));
    job = await connectorJSON(`/v1/providers/personnel/jobs/${encodeURIComponent(job.id)}`, undefined, "GET");
  }
  if (job.status !== "succeeded") throw new Error("Connect personnel sync failed; reconciliation required");
}

/** Input comes only from the existing verified/decrypted WeCom event handler. */
export async function forwardPersonnelContactEvent(msg: any): Promise<void> {
  const value = (key: string) => msg?.[key]?.value;
  await connectorJSON("/v1/providers/personnel/wecom-events", {
    corpId: value("ToUserName"), changeType: value("ChangeType"), userId: value("UserID"),
    newUserId: value("NewUserID"), departmentId: value("Id"), parentId: value("ParentId"),
  });
}
