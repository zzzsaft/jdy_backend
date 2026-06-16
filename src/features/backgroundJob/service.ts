import type { DataSource } from "typeorm";
import { PgDataSource } from "../../config/data-source.js";
import { logger } from "../../config/logger.js";
import { BackgroundJob } from "./entity/index.js";

export type BackgroundJobHandlerContext = {
  updateProgress: (progress: Record<string, any>) => Promise<void>;
};

export type BackgroundJobHandler = {
  type: string;
  run: (
    job: BackgroundJob,
    context: BackgroundJobHandlerContext,
  ) => Promise<Record<string, any> | null | undefined>;
};

export class BackgroundJobService {
  private readonly handlers = new Map<string, BackgroundJobHandler>();
  private readonly workerId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private workerRunning = false;
  private workerTimer: NodeJS.Timeout | null = null;

  constructor(private readonly dataSource: DataSource = PgDataSource) {}

  registerHandler(handler: BackgroundJobHandler): this {
    this.handlers.set(handler.type, handler);
    return this;
  }

  async enqueue(params: {
    type: string;
    payload?: Record<string, any> | null;
    progress?: Record<string, any> | null;
    maxAttempts?: number;
  }): Promise<BackgroundJob> {
    const repo = this.dataSource.getRepository(BackgroundJob);
    const job = repo.create({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      type: params.type,
      status: "queued",
      payload: params.payload ?? null,
      progress: params.progress ?? null,
      result: null,
      error: null,
      attempts: 0,
      maxAttempts: Math.max(1, Math.floor(params.maxAttempts ?? 1)),
      lockedBy: null,
      lockedUntil: null,
      startedAt: null,
      finishedAt: null,
    });
    const saved = await repo.save(job);
    setImmediate(() => {
      void this.runWorker();
    });
    return saved;
  }

  async getJob(id: string): Promise<BackgroundJob | null> {
    return this.dataSource.getRepository(BackgroundJob).findOne({
      where: { id },
    });
  }

  startWorker(params?: { intervalMs?: number }) {
    if (this.workerTimer) {
      return;
    }
    const intervalMs = Math.max(1000, params?.intervalMs ?? 5000);
    setImmediate(() => {
      void this.runWorker();
    });
    this.workerTimer = setInterval(() => {
      void this.runWorker();
    }, intervalMs);
    this.workerTimer.unref?.();
  }

  async runWorker(): Promise<void> {
    if (this.workerRunning || !this.dataSource.isInitialized) {
      return;
    }
    this.workerRunning = true;
    try {
      while (true) {
        const job = await this.claimNextJob();
        if (!job) {
          return;
        }
        await this.runClaimedJob(job);
      }
    } finally {
      this.workerRunning = false;
    }
  }

  private async claimNextJob(): Promise<BackgroundJob | null> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `
          SELECT id
          FROM public.background_jobs
          WHERE
            status = 'queued'
            OR (status = 'running' AND locked_until IS NOT NULL AND locked_until < now())
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `,
      );
      const id = rows?.[0]?.id;
      if (!id) {
        return null;
      }
      await manager.query(
        `
          UPDATE public.background_jobs
          SET
            status = 'running',
            attempts = attempts + 1,
            locked_by = $2,
            locked_until = now() + interval '30 minutes',
            started_at = COALESCE(started_at, now()),
            finished_at = NULL,
            updated_at = now()
          WHERE id = $1
        `,
        [id, this.workerId],
      );
      return manager.getRepository(BackgroundJob).findOne({ where: { id } });
    });
  }

  private async runClaimedJob(job: BackgroundJob): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      await this.failOrRequeueJob(job, `No background job handler registered for type: ${job.type}`);
      return;
    }

    try {
      logger.info(
        `[backgroundJob:run:start] jobId=${job.id} type=${job.type} attempts=${job.attempts}`,
      );
      const result = await handler.run(job, {
        updateProgress: (progress) => this.updateProgress(job.id, progress),
      });
      await this.dataSource.getRepository(BackgroundJob).update(job.id, {
        status: "completed",
        result: result ?? null,
        error: null,
        lockedBy: null,
        lockedUntil: null,
        finishedAt: new Date(),
      });
      logger.info(
        `[backgroundJob:run:end] jobId=${job.id} type=${job.type} status=completed`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.failOrRequeueJob(job, message);
    }
  }

  private async updateProgress(
    jobId: string,
    progress: Record<string, any>,
  ): Promise<void> {
    await this.dataSource.getRepository(BackgroundJob).update(jobId, {
      progress,
      lockedBy: this.workerId,
      lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
    });
  }

  private async failOrRequeueJob(
    job: BackgroundJob,
    error: string,
  ): Promise<void> {
    const shouldRetry = job.attempts < job.maxAttempts;
    await this.dataSource.getRepository(BackgroundJob).update(job.id, {
      status: shouldRetry ? "queued" : "failed",
      error,
      lockedBy: null,
      lockedUntil: null,
      finishedAt: shouldRetry ? null : new Date(),
    });
    logger.error(
      `[backgroundJob:run:failed] jobId=${job.id} type=${job.type} retry=${shouldRetry} error=${error}`,
    );
  }
}

export const backgroundJobService = new BackgroundJobService();
