import type { ProductConfigAgentRepository } from "../db.service.js";
import type { DictionaryService } from "./dictionary.service.js";
import type { CandidateReviewAction } from "../workflow/types.js";
import { elapsedMs } from "../workflow/common.js";
import { logger } from "../../../config/logger.js";

type CandidateType = "term_type" | "value";

type CandidateReviewOperation = {
  candidateType: CandidateType;
  candidateId: string;
  action: CandidateReviewAction;
  payload: any;
};

export class CandidateReviewWorkflowService {
  private candidateRecheckJobRunning = false;
  private candidateRecheckJobPending = false;
  private candidateRecheckTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: ProductConfigAgentRepository,
    private readonly dictionaryService: DictionaryService,
    private readonly generateDictionaryForDocument: (documentId: number) => Promise<any>,
  ) {}

  async reviewCandidateAndRefresh(params: CandidateReviewOperation & {
    refreshAffectedDocuments?: boolean;
    deferCandidateRecheck?: boolean;
  }) {
    const startedAt = Date.now();
    logger.info(
      `[productConfigAgent:reviewCandidateAndRefresh:start] candidateType=${params.candidateType} candidateId=${params.candidateId} ` +
        `action=${params.action} refreshAffectedDocuments=${params.refreshAffectedDocuments === true}`,
    );
    const affectedBeforeStartedAt = Date.now();
    const affectedBefore = await this.repository.findAffectedDocumentIdsForCandidate({
      candidateType: params.candidateType,
      candidateId: params.candidateId,
    });
    const affectedBeforeMs = elapsedMs(affectedBeforeStartedAt);

    const operationStartedAt = Date.now();
    const fastTermTypeAction = this.isFastTermTypeReviewAction(params);
    if (fastTermTypeAction) {
      const fastResults =
        await this.dictionaryService.reviewTermTypeCandidatesBatch([
          {
            candidateId: params.candidateId,
            action: params.action as
              | "create_term_type"
              | "approve_term_type_as_alias",
            payload: params.payload,
          },
        ]);
      const fastResult = fastResults[0];
      if (!fastResult || fastResult.status === "failed") {
        throw new Error(
          fastResult?.error ?? `candidate review failed: ${params.candidateId}`,
        );
      }
      await this.dictionaryService.bumpDictionaryVersion();
    } else {
      await this.applyCandidateReviewAction({ ...params, bumpVersion: true });
    }
    const operationMs = elapsedMs(operationStartedAt);

    const affectedAfterStartedAt = Date.now();
    const affectedAfter = await this.repository.findAffectedDocumentIdsForCandidate({
      candidateType: params.candidateType,
      candidateId: params.candidateId,
    });
    const affectedAfterMs = elapsedMs(affectedAfterStartedAt);
    const documentIds = [...new Set([...affectedBefore, ...affectedAfter])];
    const refreshed: any[] = [];
    const recheckStartedAt = Date.now();
    const dictionaryChanged = this.isDictionaryChangingReviewAction(params.action);
    const candidateRecheck = dictionaryChanged && params.deferCandidateRecheck !== true
      ? await this.dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate()
      : null;
    const recheckMs = elapsedMs(recheckStartedAt);
    const dirtyDocumentIds = [
      ...new Set([
        ...documentIds,
        ...(candidateRecheck?.affectedDocumentIds ?? []),
      ]),
    ];

    if (params.refreshAffectedDocuments === true) {
      logger.info(
        `[productConfigAgent:refreshAffectedDocuments:start] source=single documentCount=${dirtyDocumentIds.length} ` +
          `documentIds=${dirtyDocumentIds.join(",")}`,
      );
      const refreshStartedAt = Date.now();
      for (const documentId of dirtyDocumentIds) {
        refreshed.push(await this.generateDictionaryForDocument(documentId));
      }
      logger.info(
        `[productConfigAgent:refreshAffectedDocuments:end] source=single documentCount=${dirtyDocumentIds.length} totalMs=${elapsedMs(refreshStartedAt)}`,
      );
    } else if (this.isDictionaryChangingReviewAction(params.action)) {
      await this.repository.markDocumentsDictionaryDirty(dirtyDocumentIds);
    }
    if (dictionaryChanged && params.deferCandidateRecheck === true) {
      this.scheduleDeferredCandidateRecheck("reviewCandidateAndRefresh");
    }

    logger.info(
      `[productConfigAgent:reviewCandidateAndRefresh:end] candidateType=${params.candidateType} candidateId=${params.candidateId} ` +
        `action=${params.action} totalMs=${elapsedMs(startedAt)} affectedBeforeMs=${affectedBeforeMs} ` +
        `operationMs=${operationMs} affectedAfterMs=${affectedAfterMs} recheckMs=${recheckMs} ` +
        `affectedDocumentCount=${dirtyDocumentIds.length} refreshedCount=${refreshed.length}`,
    );

    return {
      candidateType: params.candidateType,
      candidateId: params.candidateId,
      action: params.action,
      affectedDocumentIds: dirtyDocumentIds,
      refreshDeferred: params.refreshAffectedDocuments !== true,
      candidateRecheckDeferred:
        dictionaryChanged && params.deferCandidateRecheck === true,
      candidateRecheck,
      refreshed,
    };
  }

  async reviewCandidatesBatch(params: {
    refreshAffectedDocuments?: boolean;
    deferCandidateRecheck?: boolean;
    operations: CandidateReviewOperation[];
  }) {
    const startedAt = Date.now();
    if (params.operations.length > 200) {
      throw new Error("operations length must be <= 200");
    }
    const operations = params.operations;
    const affectedDocumentIdsByCandidate =
      await this.repository.findAffectedDocumentIdsForCandidates(
        operations.map((operation) => ({
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
        })),
      );
    const affectedDocumentIds = new Set<number>();
    let results: Array<{
      candidateType: CandidateType;
      candidateId: string;
      action: string;
      status: "ok" | "failed";
      error?: string;
    }> = [];
    let dictionaryChanged = false;
    logger.info(
      `[productConfigAgent:reviewCandidatesBatch:start] requestedCount=${params.operations.length} processedCount=${operations.length} ` +
        `refreshAffectedDocuments=${params.refreshAffectedDocuments === true} deferCandidateRecheck=${params.deferCandidateRecheck === true}`,
    );

    const resultByOperationIndex = new Map<number, {
      candidateType: CandidateType;
      candidateId: string;
      action: string;
      status: "ok" | "failed";
      error?: string;
    }>();
    const fastTermTypeOperations = operations
      .map((operation, index) => ({ operation, index }))
      .filter(({ operation }) => this.isFastTermTypeReviewAction(operation));

    if (fastTermTypeOperations.length > 0) {
      const fastStartedAt = Date.now();
      const fastResults =
        await this.dictionaryService.reviewTermTypeCandidatesBatch(
          fastTermTypeOperations.map(({ operation }) => ({
            candidateId: operation.candidateId,
            action: operation.action as
              | "create_term_type"
              | "approve_term_type_as_alias",
            payload: operation.payload,
          })),
        );

      fastResults.forEach((result, resultIndex) => {
        const { operation, index } = fastTermTypeOperations[resultIndex];
        const affectedBefore =
          affectedDocumentIdsByCandidate.get(
            `${operation.candidateType}:${operation.candidateId}`,
          ) ?? [];
        if (result.status === "ok") {
          dictionaryChanged = true;
          for (const documentId of affectedBefore) {
            affectedDocumentIds.add(documentId);
          }
        }
        resultByOperationIndex.set(index, {
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          status: result.status,
          error: result.error,
        });
        logger.info(
          `[productConfigAgent:reviewCandidatesBatch:operation] index=${index + 1}/${operations.length} status=${result.status} ` +
            `candidateType=${operation.candidateType} candidateId=${operation.candidateId} action=${operation.action} ` +
            `fastPath=true affectedBeforeCount=${affectedBefore.length}${result.error ? ` error=${result.error}` : ""}`,
        );
      });
      logger.info(
        `[productConfigAgent:reviewCandidatesBatch:fastTermType] operationCount=${fastTermTypeOperations.length} totalMs=${elapsedMs(fastStartedAt)}`,
      );
    }

    for (const [index, operation] of operations.entries()) {
      if (resultByOperationIndex.has(index)) {
        continue;
      }
      const operationStartedAt = Date.now();
      let affectedBeforeMs = 0;
      let dictionaryWriteMs = 0;
      let affectedAfterMs = 0;
      try {
        const affectedBeforeStartedAt = Date.now();
        const affectedBefore =
          affectedDocumentIdsByCandidate.get(
            `${operation.candidateType}:${operation.candidateId}`,
          ) ?? [];
        affectedBeforeMs = elapsedMs(affectedBeforeStartedAt);
        const dictionaryWriteStartedAt = Date.now();
        await this.applyCandidateReviewAction({
          ...operation,
          bumpVersion: false,
        });
        dictionaryWriteMs = elapsedMs(dictionaryWriteStartedAt);
        const affectedAfterStartedAt = Date.now();
        const affectedAfter =
          await this.repository.findAffectedDocumentIdsForCandidate({
            candidateType: operation.candidateType,
            candidateId: operation.candidateId,
          });
        affectedAfterMs = elapsedMs(affectedAfterStartedAt);
        for (const documentId of [...affectedBefore, ...affectedAfter]) {
          affectedDocumentIds.add(documentId);
        }
        dictionaryChanged =
          dictionaryChanged ||
          this.isDictionaryChangingReviewAction(operation.action);
        resultByOperationIndex.set(index, {
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          status: "ok",
        });
        logger.info(
          `[productConfigAgent:reviewCandidatesBatch:operation] index=${index + 1}/${operations.length} status=ok ` +
            `candidateType=${operation.candidateType} candidateId=${operation.candidateId} action=${operation.action} ` +
            `totalMs=${elapsedMs(operationStartedAt)} affectedBeforeMs=${affectedBeforeMs} dictionaryWriteMs=${dictionaryWriteMs} ` +
            `affectedAfterMs=${affectedAfterMs} affectedBeforeCount=${affectedBefore.length} affectedAfterCount=${affectedAfter.length}`,
        );
      } catch (error) {
        resultByOperationIndex.set(index, {
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        logger.info(
          `[productConfigAgent:reviewCandidatesBatch:operation] index=${index + 1}/${operations.length} status=failed ` +
            `candidateType=${operation.candidateType} candidateId=${operation.candidateId} action=${operation.action} ` +
            `totalMs=${elapsedMs(operationStartedAt)} affectedBeforeMs=${affectedBeforeMs} dictionaryWriteMs=${dictionaryWriteMs} ` +
            `affectedAfterMs=${affectedAfterMs} error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    results = operations.map((operation, index) => {
      return (
        resultByOperationIndex.get(index) ?? {
          candidateType: operation.candidateType,
          candidateId: operation.candidateId,
          action: operation.action,
          status: "failed" as const,
          error: "operation was not processed",
        }
      );
    });

    let bumpVersionMs = 0;
    if (dictionaryChanged) {
      const bumpVersionStartedAt = Date.now();
      await this.dictionaryService.bumpDictionaryVersion();
      bumpVersionMs = elapsedMs(bumpVersionStartedAt);
    }
    const recheckStartedAt = Date.now();
    const candidateRecheck = dictionaryChanged && params.deferCandidateRecheck !== true
      ? await this.dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate()
      : null;
    const recheckMs = elapsedMs(recheckStartedAt);

    const documentIds = [
      ...new Set([
        ...affectedDocumentIds,
        ...(candidateRecheck?.affectedDocumentIds ?? []),
      ]),
    ];
    const refreshed: any[] = [];
    if (params.refreshAffectedDocuments === true) {
      logger.info(
        `[productConfigAgent:refreshAffectedDocuments:start] source=batch documentCount=${documentIds.length} ` +
          `documentIds=${documentIds.join(",")}`,
      );
      const refreshStartedAt = Date.now();
      for (const documentId of documentIds) {
        refreshed.push(await this.generateDictionaryForDocument(documentId));
      }
      logger.info(
        `[productConfigAgent:refreshAffectedDocuments:end] source=batch documentCount=${documentIds.length} totalMs=${elapsedMs(refreshStartedAt)}`,
      );
    } else if (dictionaryChanged) {
      await this.repository.markDocumentsDictionaryDirty(documentIds);
    }
    if (dictionaryChanged && params.deferCandidateRecheck === true) {
      this.scheduleDeferredCandidateRecheck("reviewCandidatesBatch");
    }

    logger.info(
      `[productConfigAgent:reviewCandidatesBatch:end] requestedCount=${params.operations.length} processedCount=${operations.length} ` +
        `successCount=${results.filter((item) => item.status === "ok").length} failedCount=${results.filter((item) => item.status === "failed").length} ` +
        `dictionaryChanged=${dictionaryChanged} bumpVersionMs=${bumpVersionMs} recheckMs=${recheckMs} deferCandidateRecheck=${params.deferCandidateRecheck === true} ` +
        `affectedDocumentCount=${documentIds.length} refreshedCount=${refreshed.length} totalMs=${elapsedMs(startedAt)}`,
    );

    return {
      requestedCount: params.operations.length,
      processedCount: operations.length,
      successCount: results.filter((item) => item.status === "ok").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      affectedDocumentIds: documentIds,
      refreshDeferred: params.refreshAffectedDocuments !== true,
      candidateRecheckDeferred:
        dictionaryChanged && params.deferCandidateRecheck === true,
      candidateRecheck,
      refreshed,
      results,
    };
  }

  private async applyCandidateReviewAction(params: CandidateReviewOperation & {
    bumpVersion: boolean;
  }): Promise<void> {
    if (params.action === "create_term_type") {
      await this.dictionaryService.createTermTypeFromCandidate({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "approve_term_type_as_alias") {
      await this.dictionaryService.approveTermTypeCandidateAsAlias({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "split_term_type") {
      await this.dictionaryService.splitTermTypeCandidate({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "create_value") {
      await this.dictionaryService.createValueFromCandidate({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "approve_value_as_alias") {
      await this.dictionaryService.approveValueCandidateAsAlias({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "split_value") {
      await this.dictionaryService.splitValueCandidate({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "move_value_to_other_term_type") {
      await this.dictionaryService.moveValueCandidateToTermType({
        ...params.payload,
        candidateId: params.candidateId,
        bumpVersion: params.bumpVersion,
      });
    } else if (params.action === "update_term_type_value_kind") {
      await this.dictionaryService.updateTermTypeValueKind({
        termType: params.payload.termType,
        valueKind: params.payload.valueKind,
        resolvedValueCandidateId: params.candidateId,
        reviewedBy: params.payload.reviewedBy,
        bumpVersion: params.bumpVersion,
      });
    } else if (
      params.action === "reject" &&
      params.candidateType === "term_type"
    ) {
      await this.dictionaryService.rejectTermTypeCandidate({
        candidateId: params.candidateId,
        reviewedBy: params.payload.reviewedBy,
        reason: params.payload.reason,
      });
    } else if (params.action === "reject" && params.candidateType === "value") {
      await this.dictionaryService.rejectValueCandidate({
        candidateId: params.candidateId,
        reviewedBy: params.payload.reviewedBy,
        reason: params.payload.reason,
      });
    }
  }

  private isDictionaryChangingReviewAction(action: string): boolean {
    return !["reject", "move_value_to_other_term_type"].includes(action);
  }

  private isFastTermTypeReviewAction(operation: {
    candidateType: CandidateType;
    action: string;
  }): boolean {
    return (
      operation.candidateType === "term_type" &&
      (operation.action === "create_term_type" ||
        operation.action === "approve_term_type_as_alias")
    );
  }

  private scheduleDeferredCandidateRecheck(source: string): void {
    if (this.candidateRecheckJobRunning) {
      this.candidateRecheckJobPending = true;
      logger.info(
        `[productConfigAgent:dictionary:deferredCandidateRecheck:queued] source=${source} reason=already_running`,
      );
      return;
    }

    if (this.candidateRecheckTimer) {
      clearTimeout(this.candidateRecheckTimer);
    }
    this.candidateRecheckTimer = setTimeout(() => {
      this.candidateRecheckTimer = null;
      this.candidateRecheckJobRunning = true;
      void (async () => {
        const startedAt = Date.now();
        try {
          logger.info(
            `[productConfigAgent:dictionary:deferredCandidateRecheck:start] source=${source}`,
          );
          const result =
            await this.dictionaryService.recheckPendingCandidatesAfterDictionaryUpdate();
          if (result.affectedDocumentIds.length > 0) {
            await this.repository.markDocumentsDictionaryDirty(
              result.affectedDocumentIds,
            );
          }
          logger.info(
            `[productConfigAgent:dictionary:deferredCandidateRecheck:end] source=${source} totalMs=${elapsedMs(startedAt)} ` +
              `affectedDocumentCount=${result.affectedDocumentIds.length} ` +
              `resolvedTermTypeCandidateCount=${result.resolvedTermTypeCandidateCount} ` +
              `resolvedValueCandidateCount=${result.resolvedValueCandidateCount}`,
          );
        } catch (error) {
          logger.error(
            `[productConfigAgent:dictionary:deferredCandidateRecheck:failed] source=${source} totalMs=${elapsedMs(startedAt)} ` +
              `error=${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          this.candidateRecheckJobRunning = false;
          if (this.candidateRecheckJobPending) {
            this.candidateRecheckJobPending = false;
            this.scheduleDeferredCandidateRecheck("queued_dictionary_update");
          }
        }
      })();
    }, 1500);
  }
}
