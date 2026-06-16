import "../src/config/env.js";
import { BaseEntity, In, Like } from "typeorm";
import { PgDataSource } from "../src/config/data-source.js";
import { XftAtdOut } from "../src/entity/atd/xft_out.js";
import { LogExpress } from "../src/features/log/entity/log_express.js";
import { XftTaskEvent } from "../src/features/xft/controller/todo.xft.controller.js";
import { xftOAApiClient } from "../src/features/xft/api/xft_oa.js";
import { OutGoingEvent } from "../src/features/xft/service/atd/outgoing.js";

type ReplayResult = {
  logId: number;
  businessParam: string;
  ok: boolean;
  error?: string;
};

type XftFormDataRecord = {
  busKey: string;
  formData: string;
};

const runQuietly = async <T>(action: () => Promise<T>) => {
  const originalLog = console.log;
  console.log = () => undefined;
  try {
    return await action();
  } finally {
    console.log = originalLog;
  }
};

const isOutgoingTask = (task: XftTaskEvent) => {
  const text = [
    task.details,
    task.title,
    task.businessName,
    task.businessParam,
  ].join(" ");

  return (
    task.businessParam?.startsWith("NFORM_") &&
    (text.includes("外出") || text.includes("outgoing"))
  );
};

const chunksOf = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const main = async () => {
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  const canCallXft = Boolean(
    process.env.XFT_APPID && process.env.XFT_AUTHORITY_SECRET
  );
  const logs = await LogExpress.find({
    where: {
      path: "/xft/event",
      content: Like("%NFORM_%"),
    },
    order: { id: "ASC" },
  });

  const results: ReplayResult[] = [];
  const tasksByBusinessParam = new Map<string, { logId: number; task: XftTaskEvent }>();
  let matched = 0;

  for (const log of logs) {
    let task: XftTaskEvent;
    try {
      task = new XftTaskEvent(log.content);
    } catch (error) {
      results.push({
        logId: log.id,
        businessParam: "",
        ok: false,
        error: `parse content failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      continue;
    }

    if (!isOutgoingTask(task)) continue;
    matched += 1;
    if (!tasksByBusinessParam.has(task.businessParam)) {
      tasksByBusinessParam.set(task.businessParam, { logId: log.id, task });
    }
  }

  if (!canCallXft) {
    console.log(
      JSON.stringify(
        {
          scanned: logs.length,
          matched,
          uniqueBusinessParams: tasksByBusinessParam.size,
          replayed: 0,
          blocked:
            "Missing XFT_APPID or XFT_AUTHORITY_SECRET; cannot call xftOAApiClient.getFormData.",
        },
        null,
        2
      )
    );
    return;
  }

  const businessParams = [...tasksByBusinessParam.keys()];
  const existingBusinessParams = new Set<string>();
  for (const chunk of chunksOf(businessParams, 1000)) {
    const existingRecords = await XftAtdOut.find({
      where: { serialNumber: In(chunk) },
      select: ["serialNumber"],
    });
    for (const record of existingRecords) {
      existingBusinessParams.add(record.serialNumber);
    }
  }

  const pendingBusinessParams = businessParams.filter(
    (businessParam) => !existingBusinessParams.has(businessParam)
  );

  let replayed = 0;
  for (const chunk of chunksOf(pendingBusinessParams, 50)) {
    let response;
    try {
      response = await runQuietly(() => xftOAApiClient.getFormData(chunk));
    } catch (error) {
      for (const businessParam of chunk) {
        const { logId } = tasksByBusinessParam.get(businessParam)!;
        results.push({
          logId,
          businessParam,
          ok: false,
          error:
            error instanceof Error ? error.stack ?? error.message : String(error),
        });
      }
      replayed += chunk.length;
      console.log(`replayed ${replayed}/${pendingBusinessParams.length}`);
      continue;
    }

    const recordsByBusinessParam = new Map<string, XftFormDataRecord>(
      ((response?.body ?? []) as XftFormDataRecord[]).map((record) => [
        record.busKey,
        record,
      ])
    );

    for (const businessParam of chunk) {
      const { logId, task } = tasksByBusinessParam.get(businessParam)!;
      try {
        const record = recordsByBusinessParam.get(businessParam);
        if (!record) {
          throw new Error("xft getFormData returned no record");
        }

        const outerFormData = JSON.parse(record.formData);
        const formData = JSON.parse(outerFormData.formData);
        const parsedData = JSON.parse(outerFormData.parsedData);
        const event = new OutGoingEvent(task);
        event.location = formData?.["1358473495a6"]?.label;
        event.type = formData?.["370914c10045"]?.label;
        event.sponsorName = formData?.["applyUser"]?.[0]?.USRNAM;
        event.beginTime = formData?.["startTime"];
        event.endTime = formData?.["endTime"];
        event.remark = formData?.["remark"];

        await event.savetoDb(parsedData, formData);
        const saved = await XftAtdOut.findOne({
          where: { serialNumber: businessParam },
          select: ["serialNumber"],
        });
        if (!saved) {
          throw new Error("outgoing replay completed but no DB row was saved");
        }
        results.push({
          logId,
          businessParam,
          ok: true,
        });
      } catch (error) {
        results.push({
          logId,
          businessParam,
          ok: false,
          error:
            error instanceof Error ? error.stack ?? error.message : String(error),
        });
      }
    }

    replayed += chunk.length;
    if (replayed % 500 === 0 || replayed === pendingBusinessParams.length) {
      console.log(`replayed ${replayed}/${pendingBusinessParams.length}`);
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log(
    JSON.stringify(
      {
        scanned: logs.length,
        matched,
        uniqueBusinessParams: tasksByBusinessParam.size,
        skippedExisting: existingBusinessParams.size,
        replayed: pendingBusinessParams.length,
        ok: results.length - failed.length,
        failed: failed.length,
        failures: failed.map((result) => ({
          logId: result.logId,
          businessParam: result.businessParam,
          error: result.error,
        })),
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (PgDataSource.isInitialized) {
      await PgDataSource.destroy();
    }
  });
