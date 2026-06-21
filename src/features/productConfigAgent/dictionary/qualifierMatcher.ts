import type {
  DictionaryExtractionQualifier,
  DictionaryExtractionQualifierArea,
  DictionaryExtractionQualifierPosition,
} from "../normalization/types.js";
import type { DictionaryQualifierKind } from "./entity/index.js";

export type QualifierMatcherRow = {
  qualifierKey: string;
  kind: DictionaryQualifierKind;
  displayName: string;
  aliases?: string[] | null;
  sortOrder?: number | null;
};

export type RuntimeQualifierMatch = {
  qualifierKey: string;
  qualifierKind: DictionaryQualifierKind;
  matchedAlias: string;
  sourceText: string;
  pattern: RegExp;
  stripPattern: RegExp;
  position?: DictionaryExtractionQualifierPosition;
  area?: DictionaryExtractionQualifierArea;
  layer?: string;
  stripFromFieldName: boolean;
};

export type QualifierMatcher = {
  rules: RuntimeQualifierRule[];
  conceptPattern: RegExp;
  findMatches(text: string): RuntimeQualifierMatch[];
  detect(texts: string[]): {
    qualifier?: DictionaryExtractionQualifier;
    matches: RuntimeQualifierMatch[];
    sourceText?: string;
  };
};

export type RuntimeQualifierRule = {
  qualifierKey: string;
  qualifierKind: DictionaryQualifierKind;
  alias: string;
  normalizedAlias: string;
  pattern: RegExp;
  stripPattern: RegExp;
  sortOrder: number;
  specificity: number;
  position?: DictionaryExtractionQualifierPosition;
  area?: DictionaryExtractionQualifierArea;
  layer?: string;
  stripFromFieldName: boolean;
};

const DEFAULT_QUALIFIER_ROWS: QualifierMatcherRow[] = [
  row("upper_die", "position", "上模", ["上 模", "upper die"], 10),
  row("lower_die", "position", "下模", ["下 模", "lower die"], 20),
  row("pre_pump", "position", "泵前", ["泵 前", "before pump"], 30),
  row("post_pump", "position", "泵后", ["泵 后", "after pump"], 40),
  row("pre_mesh", "position", "网前", ["网 前", "before mesh"], 50),
  row("post_mesh", "position", "网后", ["网 后", "after mesh"], 60),
  row("inlet", "position", "入口", ["进料口", "inlet"], 70),
  row("c_inlet", "position", "C入口", ["C口", "C 入口", "C inlet"], 80),
  row("layer", "layer", "层位", ["A层", "B层", "C层", "D层", "第一层", "第1层", "layer"], 90),
  row("body", "area", "本体", ["主体", "body"], 110),
  row("die_body", "area", "模体", ["模头", "上模体", "下模体", "die body"], 120),
  row("lip", "area", "模唇", ["唇口", "lip"], 130),
  row("connector", "area", "连接器", ["接头", "接线盒", "接插件", "connector"], 140),
  row("insert_block", "area", "镶块", ["insert block", "insert_block"], 150),
  row("channel", "area", "流道", ["流面", "腔体", "channel"], 160),
  row("external_surface", "area", "外表面", ["外形", "精磨", "external surface"], 170),
  row("side_plate", "area", "侧板", ["两侧板", "side plate", "side_plate"], 180),
  row("feedblock", "area", "分配器", ["合流器", "feedblock", "manifold"], 190),
  row("pump", "area", "泵体", ["pump"], 200),
  row("overall", "area", "总体", ["总加热", "总分区", "总计", "合计", "overall", "total"], 210),
  row("other", "area", "其他", ["其它", "other"], 220),
];

const FALLBACK_MATCHER = buildQualifierMatcher(DEFAULT_QUALIFIER_ROWS);
let runtimeMatcher: QualifierMatcher = FALLBACK_MATCHER;

export function getRuntimeQualifierMatcher(): QualifierMatcher {
  return runtimeMatcher;
}

export function setRuntimeQualifierMatcher(matcher: QualifierMatcher): void {
  runtimeMatcher = matcher;
}

export function buildQualifierMatcher(rows: QualifierMatcherRow[]): QualifierMatcher {
  const sourceRows = rows.length > 0 ? rows : DEFAULT_QUALIFIER_ROWS;
  const rules = sourceRows
    .filter((item) => item.qualifierKey && item.kind && item.displayName)
    .flatMap((item) => buildRules(item))
    .sort(compareRules);

  const conceptPattern = rules.length
    ? new RegExp(rules.map((rule) => rule.pattern.source).join("|"), "iu")
    : /$a/;

  return {
    rules,
    conceptPattern,
    findMatches(text: string) {
      const compact = compactText(text);
      if (!compact) return [];
      const matches: RuntimeQualifierMatch[] = [];
      for (const rule of rules) {
        if (!rule.pattern.test(compact)) continue;
        matches.push({
          qualifierKey: rule.qualifierKey,
          qualifierKind: rule.qualifierKind,
          matchedAlias: rule.alias,
          sourceText: compact.match(rule.pattern)?.[0] ?? rule.alias,
          pattern: rule.pattern,
          stripPattern: rule.stripPattern,
          position: rule.position,
          area: rule.area,
          layer: rule.layer,
          stripFromFieldName: rule.stripFromFieldName,
        });
      }
      return matches;
    },
    detect(texts: string[]) {
      let qualifier: DictionaryExtractionQualifier | undefined;
      let sourceText: string | undefined;
      const collected: RuntimeQualifierMatch[] = [];
      for (const text of texts) {
        const matches = this.findMatches(text);
        if (matches.length === 0) continue;
        collected.push(...matches);
        for (const match of matches) {
          qualifier = {
            ...qualifier,
            position: qualifier?.position ?? match.position,
            area: qualifier?.area ?? match.area,
            layer: qualifier?.layer ?? match.layer,
            sourceText: qualifier?.sourceText ?? sourceText ?? match.sourceText,
          };
          sourceText ??= match.sourceText;
        }
        if (qualifier?.position || qualifier?.area || qualifier?.layer) break;
      }
      return { qualifier, matches: collected, sourceText };
    },
  };
}

function buildRules(row: QualifierMatcherRow): RuntimeQualifierRule[] {
  const aliases = uniqueNonEmpty([
    row.displayName,
    ...(Array.isArray(row.aliases) ? row.aliases : []),
    row.qualifierKey,
  ]);
  return aliases.map((alias) => {
    const normalizedAlias = compactText(alias);
    const pattern = new RegExp(escapeRegExp(normalizedAlias), "iu");
    return {
      qualifierKey: row.qualifierKey,
      qualifierKind: row.kind,
      alias,
      normalizedAlias,
      pattern,
      stripPattern: pattern,
      sortOrder: row.sortOrder ?? 100,
      specificity: qualifierSpecificity(row.qualifierKey, row.kind),
      position:
        row.kind === "position"
          ? (row.qualifierKey as DictionaryExtractionQualifierPosition)
          : undefined,
      area:
        row.kind === "area"
          ? (row.qualifierKey as DictionaryExtractionQualifierArea)
          : undefined,
      layer: row.kind === "layer" ? row.qualifierKey : undefined,
      stripFromFieldName: row.kind === "position",
    };
  });
}

function compareRules(a: RuntimeQualifierRule, b: RuntimeQualifierRule): number {
  return (
    b.normalizedAlias.length - a.normalizedAlias.length ||
    b.specificity - a.specificity ||
    a.sortOrder - b.sortOrder ||
    a.qualifierKey.localeCompare(b.qualifierKey) ||
    a.alias.localeCompare(b.alias)
  );
}

function qualifierSpecificity(key: string, kind: DictionaryQualifierKind): number {
  const keySpecificity: Record<string, number> = {
    c_inlet: 50,
    upper_die: 40,
    lower_die: 40,
    pre_mesh: 35,
    post_mesh: 35,
    pre_pump: 35,
    post_pump: 35,
    insert_block: 30,
    external_surface: 30,
    side_plate: 30,
    die_body: 30,
    inlet: 20,
  };
  return (keySpecificity[key] ?? 0) + (kind === "position" ? 10 : kind === "area" ? 5 : 0);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    const normalized = compactText(trimmed);
    if (!trimmed || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
  }
  return result;
}

function row(
  qualifierKey: string,
  kind: DictionaryQualifierKind,
  displayName: string,
  aliases: string[],
  sortOrder: number,
): QualifierMatcherRow {
  return { qualifierKey, kind, displayName, aliases, sortOrder };
}

function compactText(value: string): string {
  return String(value ?? "").replace(/\s+/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
