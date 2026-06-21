import type { DataSource } from "typeorm";
import { logger } from "../../../config/logger.js";

export type AdvisoryLockResult<T> =
  | { acquired: false }
  | { acquired: true; value: T };

export type AdvisoryLockHandle = {
  release: () => Promise<void>;
};

export async function tryAdvisoryLock(
  dataSource: DataSource,
  key: number,
): Promise<AdvisoryLockHandle | null> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  let rows: any[];
  try {
    rows = await queryRunner.query(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [key],
    );
  } catch (error) {
    await queryRunner.release();
    throw error;
  }
  if (rows?.[0]?.locked !== true) {
    await queryRunner.release();
    return null;
  }

  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      try {
        const unlockRows = await queryRunner.query(
          "SELECT pg_advisory_unlock($1) AS unlocked",
          [key],
        );
        if (unlockRows?.[0]?.unlocked !== true) {
          logger.error(
            `[productConfigAgent:advisory-lock:unlock-failed] key=${key} error=lock_not_owned`,
          );
        }
      } catch (error) {
        logger.error(
          `[productConfigAgent:advisory-lock:unlock-failed] key=${key} error=${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        await queryRunner.release();
      }
    },
  };
}

export async function withTryAdvisoryLock<T>(
  dataSource: DataSource,
  key: number,
  action: () => Promise<T>,
): Promise<AdvisoryLockResult<T>> {
  const lock = await tryAdvisoryLock(dataSource, key);
  if (!lock) {
    return { acquired: false };
  }
  try {
    return { acquired: true, value: await action() };
  } finally {
    await lock.release();
  }
}
