import assert from "node:assert/strict";
import { AgentRuntimeService } from "./service.js";
import {
  AgentMessage,
  AgentRun,
  AgentSession,
  AgentToolCall,
} from "./entity/index.js";

class FakeRepository<T extends { id?: string; createdAt?: Date; updatedAt?: Date }> {
  private nextId = 1;

  constructor(private readonly rows: T[]) {}

  create(value: Partial<T>): T {
    return value as T;
  }

  async save(value: T): Promise<T> {
    const now = new Date();
    if (!value.id) {
      value.id = String(this.nextId++);
      value.createdAt = now;
    }
    value.updatedAt = now;
    const index = this.rows.findIndex((row) => row.id === value.id);
    if (index >= 0) {
      this.rows[index] = value;
    } else {
      this.rows.push(value);
    }
    return value;
  }

  async update(id: string, patch: Partial<T>): Promise<void> {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return;
    Object.assign(row, patch, { updatedAt: new Date() });
  }

  async findOne(params: { where: Partial<T> }): Promise<T | null> {
    return (
      this.rows.find((row) =>
        Object.entries(params.where).every(
          ([key, value]) => (row as any)[key] === value,
        ),
      ) ?? null
    );
  }

  async find(params?: { where?: Partial<T>; order?: Record<string, string> }) {
    let rows = [...this.rows];
    if (params?.where) {
      rows = rows.filter((row) =>
        Object.entries(params.where ?? {}).every(
          ([key, value]) => (row as any)[key] === value,
        ),
      );
    }
    if (params?.order?.createdAt === "ASC") {
      rows.sort((left, right) => Number(left.createdAt) - Number(right.createdAt));
    }
    if (params?.order?.createdAt === "DESC") {
      rows.sort((left, right) => Number(right.createdAt) - Number(left.createdAt));
    }
    return rows;
  }

  createQueryBuilder() {
    const sourceRows = this.rows;
    let ownerUserId: string | undefined;
    let agentType: string | undefined;
    let status: string | undefined;
    let offset = 0;
    let limit = 20;
    return {
      orderBy() {
        return this;
      },
      offset(value: number) {
        offset = value;
        return this;
      },
      limit(value: number) {
        limit = value;
        return this;
      },
      andWhere(_sql: string, params: Record<string, string>) {
        ownerUserId = params.ownerUserId ?? ownerUserId;
        agentType = params.agentType ?? agentType;
        status = params.status ?? status;
        return this;
      },
      async getManyAndCount() {
        let rows = [...sourceRows] as T[];
        if (ownerUserId) rows = rows.filter((row) => (row as any).ownerUserId === ownerUserId);
        if (agentType) rows = rows.filter((row) => (row as any).agentType === agentType);
        if (status) rows = rows.filter((row) => (row as any).status === status);
        return [rows.slice(offset, offset + limit), rows.length] as const;
      },
    };
  }
}

class FakeDataSource {
  rows = new Map<unknown, any[]>();
  repos = new Map<unknown, FakeRepository<any>>();

  getRepository<T extends { id?: string }>(entity: unknown): FakeRepository<T> {
    if (!this.rows.has(entity)) {
      this.rows.set(entity, []);
    }
    if (!this.repos.has(entity)) {
      this.repos.set(entity, new FakeRepository(this.rows.get(entity) ?? []));
    }
    return this.repos.get(entity) as FakeRepository<T>;
  }
}

const dataSource = new FakeDataSource();
const runtime = new AgentRuntimeService(dataSource as any).registerAgent({
  agentType: "testAgent",
  async createPlan() {
    return {
      intent: "test",
      steps: [{ id: "step_1", tool: "testTool", args: { ok: true } }],
    };
  },
  async executePlan(input) {
    const step = input.plan.steps?.[0]!;
    await input.onToolStart({ step });
    await input.onToolFinish({
      step,
      result: { ok: true },
      durationMs: 3,
    });
    return {
      context: { ok: true },
      artifacts: { demo: { id: 1 } },
      assistantMessage: { content: "done" },
    };
  },
});

const result = await runtime.run({
  agentType: "testAgent",
  message: "run test agent",
  ownerUserId: "u1",
});
assert.equal(result.run?.status, "completed");
assert.equal(result.messages.length, 2);
const runDetail = await runtime.getRunDetail({
  runId: String(result.run?.id),
  ownerUserId: "u1",
});
assert.equal(runDetail.toolCalls.length, 1);
assert.equal(runDetail.toolCalls[0].status, "completed");
assert.deepEqual(runDetail.toolCalls[0].result, { ok: true });

const list = await runtime.listSessions({ ownerUserId: "u1" });
assert.equal(list.total, 1);
await runtime.updateSession({
  sessionId: String(result.session.id),
  ownerUserId: "u1",
  title: "renamed",
  status: "archived",
});
const session = await runtime.getSessionDetail({
  sessionId: String(result.session.id),
  ownerUserId: "u1",
});
assert.equal(session.session.title, "renamed");
assert.equal(session.session.status, "archived");

const defaultSession = await runtime.createSession({
  ownerUserId: "u1",
  title: "general chat",
});
assert.equal(defaultSession.agentType, "generalAgent");

const failedDataSource = new FakeDataSource();
const failingRuntime = new AgentRuntimeService(failedDataSource as any).registerAgent({
  agentType: "failingAgent",
  async createPlan() {
    return {
      intent: "fail",
      steps: [{ id: "step_fail", tool: "badTool", args: {} }],
    };
  },
  async executePlan(input) {
    const step = input.plan.steps?.[0]!;
    await input.onToolStart({ step });
    const error = new Error("tool failed");
    await input.onToolFinish({ step, error, durationMs: 1 });
    throw error;
  },
});

await assert.rejects(
  () =>
    failingRuntime.run({
      agentType: "failingAgent",
      message: "fail please",
      ownerUserId: "u1",
    }),
  /tool failed/,
);
const failedRuns = failedDataSource.rows.get(AgentRun) ?? [];
const failedToolCalls = failedDataSource.rows.get(AgentToolCall) ?? [];
const failedMessages = failedDataSource.rows.get(AgentMessage) ?? [];
assert.equal(failedRuns[0].status, "failed");
assert.equal(failedToolCalls[0].status, "failed");
assert.match(failedMessages.at(-1)?.content ?? "", /Run failed/);
assert.equal((failedDataSource.rows.get(AgentSession) ?? []).length, 1);

const unregisteredDataSource = new FakeDataSource();
const unregisteredRuntime = new AgentRuntimeService(unregisteredDataSource as any);
const unsupported = await unregisteredRuntime.run({
  agentType: "quoteAgent",
  message: "帮我生成报价",
  ownerUserId: "u1",
});
assert.equal(unsupported.run, null);
assert.equal(unsupported.session.agentType, "quoteAgent");
assert.match(unsupported.messages.at(-1)?.content ?? "", /reserved but not enabled/);
assert.equal((unregisteredDataSource.rows.get(AgentRun) ?? []).length, 0);
assert.equal((unregisteredDataSource.rows.get(AgentSession) ?? []).length, 1);

const clarificationDataSource = new FakeDataSource();
const clarificationRuntime = new AgentRuntimeService(clarificationDataSource as any);
const clarification = await clarificationRuntime.run({
  message: "帮我处理一下",
  ownerUserId: "u1",
});
assert.equal(clarification.run, null);
assert.equal(clarification.session.agentType, "generalAgent");
assert.equal(clarification.context.routeDecision.needsClarification, true);

console.log("agentRuntime service tests passed");
