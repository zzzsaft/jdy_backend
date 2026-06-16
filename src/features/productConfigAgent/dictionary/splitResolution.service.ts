import { DataSource, In } from "typeorm";
import {
  DictionaryCandidate,
  DictionaryCandidateOccurrence,
  SplitResolution,
} from "./entity/index.js";
import {
  candidateSplitResolutionRawValues,
  splitResolutionLookupKey,
} from "./dictionary.service.helpers.js";

type SplitResolutionLookupInput = {
  documentId: string;
  extractionResultId: string;
  itemIndex: number;
  rawValue: string;
};

export class SplitResolutionService {
  constructor(private readonly dataSource: DataSource) {}

  async buildCandidateReviewSplitResolutionLookup(
    candidates: DictionaryCandidate[],
    occurrences: DictionaryCandidateOccurrence[],
  ): Promise<Map<string, SplitResolution>> {
    const splitResolutionRepo = this.dataSource.getRepository(SplitResolution);
    const extractionResultIds = [
      ...new Set(
        [
          ...candidates.map((candidate) => candidate.extractionResultId),
          ...occurrences.map((occurrence) => occurrence.extractionResultId),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    if (extractionResultIds.length === 0) {
      return new Map();
    }

    const rows = await splitResolutionRepo.find({
      where: {
        extractionResultId: In(extractionResultIds),
        source: "candidate_review",
      },
    });
    return new Map(
      rows.map((row) => [
        this.buildLookupKey({
          documentId: row.documentId,
          extractionResultId: row.extractionResultId,
          itemIndex: row.itemIndex,
          rawValue: row.rawValue,
        }),
        row,
      ]),
    );
  }

  findCandidateSplitResolution(
    candidate: DictionaryCandidate,
    occurrences: DictionaryCandidateOccurrence[],
    splitResolutionLookup: Map<string, SplitResolution>,
  ): SplitResolution | undefined {
    const rawValues = candidateSplitResolutionRawValues(candidate);
    const occurrenceInputs =
      occurrences.length > 0
        ? occurrences.map((occurrence) => ({
            documentId: occurrence.documentId,
            extractionResultId: occurrence.extractionResultId,
            itemIndex: occurrence.itemIndex,
            rawValues: [occurrence.rawValue, ...rawValues],
          }))
        : [
            {
              documentId: candidate.documentId,
              extractionResultId: candidate.extractionResultId,
              itemIndex: candidate.itemIndex,
              rawValues,
            },
          ];

    for (const input of occurrenceInputs) {
      if (!input.documentId || !input.extractionResultId || input.itemIndex === null) {
        continue;
      }
      for (const rawValue of input.rawValues) {
        if (!rawValue) continue;
        const splitResolution = splitResolutionLookup.get(
          this.buildLookupKey({
            documentId: input.documentId,
            extractionResultId: input.extractionResultId,
            itemIndex: input.itemIndex,
            rawValue,
          }),
        );
        if (splitResolution) {
          return splitResolution;
        }
      }
    }

    return undefined;
  }

  async saveMoveValueSplitResolution(params: {
    candidate: DictionaryCandidate;
    targetTermType: string;
    movedRawValue: string;
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const occurrenceRepo = manager.getRepository(DictionaryCandidateOccurrence);
      const splitResolutionRepo = manager.getRepository(SplitResolution);
      const occurrences = await occurrenceRepo.find({
        where: { candidateType: "value", candidateId: params.candidate.id },
      });
      const splitFields = [
        {
          field_name: params.targetTermType,
          value: params.movedRawValue,
          raw_text: params.candidate.rawValue,
          confidence: params.candidate.confidence
            ? Number(params.candidate.confidence)
            : undefined,
        },
      ];

      if (occurrences.length === 0) {
        return;
      }

      await splitResolutionRepo.upsert(
        occurrences.map((occurrence) => {
          const rawValue = occurrence.rawValue ?? params.candidate.rawValue;
          return {
            documentId: occurrence.documentId,
            extractionResultId: occurrence.extractionResultId,
            itemIndex: occurrence.itemIndex,
            rawFieldName: occurrence.fieldName,
            rawValue,
            rawText: rawValue,
            splitFields,
            evidence: occurrence.evidence ?? params.candidate.evidence ?? null,
            source: "candidate_review",
          };
        }) as any[],
        {
          conflictPaths: [
            "extractionResultId",
            "itemIndex",
            "rawFieldName",
            "rawValue",
            "source",
          ],
          skipUpdateIfNoValuesChanged: true,
        },
      );
    });
  }

  private buildLookupKey(params: SplitResolutionLookupInput): string {
    return splitResolutionLookupKey(params);
  }
}
