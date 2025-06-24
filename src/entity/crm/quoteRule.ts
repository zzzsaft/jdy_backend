import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from "typeorm";

export interface RuleCondition {
  field: string;
  operator: string;
  value?: string;
}

@Entity({ name: "crm_quote_rule" })
export class QuoteRule extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column("simple-array", { name: "product_category", nullable: true })
  productCategory: string[];

  @Column({ name: "type" })
  ruleType: "price" | "grade" | "delivery";

  @Column({ default: 0 })
  priority: number;

  @Column({ default: true })
  active: boolean;

  @Column("jsonb", { nullable: true })
  conditions?: RuleCondition[];

  @Column({ default: "and" })
  relation: "and" | "or";

  @Column("jsonb", { nullable: true })
  step?: { interval: number; amount: number };

  @Column("text", { nullable: true })
  code?: string;

  @Column("decimal", { precision: 10, scale: 2, default: 0 })
  addition: number;

  @Column({ nullable: true })
  grade?: string;

  @Column({ name: "delivery_days", type: "int", nullable: true })
  deliveryDays?: number;
}
