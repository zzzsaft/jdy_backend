import assert from "node:assert/strict";
import { applyContractDocumentListFilters } from "../../utils/archiveListFilters.js";

type RecordedClause = {
  kind: "where" | "orWhere" | "andWhere";
  sql: string;
  params?: Record<string, unknown>;
};

class FakeQueryBuilder {
  clauses: RecordedClause[] = [];

  andWhere(condition: any, params?: Record<string, unknown>) {
    if (condition && typeof condition.whereFactory === "function") {
      const nested = new FakeNestedWhereBuilder();
      condition.whereFactory(nested);
      this.clauses.push(...nested.clauses);
      return this;
    }
    this.clauses.push({ kind: "andWhere", sql: String(condition), params });
    return this;
  }
}

class FakeNestedWhereBuilder {
  clauses: RecordedClause[] = [];

  where(sql: string, params?: Record<string, unknown>) {
    this.clauses.push({ kind: "where", sql, params });
    return this;
  }

  orWhere(sql: string, params?: Record<string, unknown>) {
    this.clauses.push({ kind: "orWhere", sql, params });
    return this;
  }
}

const builder = new FakeQueryBuilder();
applyContractDocumentListFilters(builder, {
  status: "normalized",
  q: "合同",
  productNumber: "PN-001",
  customerId: "C-001",
});

const sql = builder.clauses.map((clause) => clause.sql).join("\n");

assert.match(sql, /document\.status = :status/);
assert.match(sql, /document\.file_name ILIKE :q/);
assert.match(sql, /archive\.customer_id = :customerId/);
assert.match(sql, /document_info,customer_id,value/);
assert.match(sql, /archive\.product_number ILIKE :productNumber/);
assert.match(sql, /document_info,product_number,value/);
assert.match(sql, /document_info,die_number,value/);

assert.ok(
  builder.clauses.some(
    (clause) => clause.params?.customerId === "C-001",
  ),
);
assert.ok(
  builder.clauses.some(
    (clause) => clause.params?.productNumber === "%PN-001%",
  ),
);

console.log("productConfigAgent contract archive query tests passed");
