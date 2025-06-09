// src/entities/BusinessOpportunity.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("crm_opportunities")
export class Opportunity extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: "opportunity_code", nullable: true })
  opportunityCode: string;

  @Column({ name: "name" })
  name: string;

  @Column({ name: "status", nullable: true })
  status: string;

  @Column({ name: "account_id", nullable: true })
  accountId: string;

  @Column({ name: "account_name", nullable: true })
  accountName: string;

  @Column({ name: "charger_id", nullable: true })
  chargerId: string;

  @Column({ name: "charger_name", nullable: true })
  chargerName: string;

  @Column({ name: "applicable_materials", type: "simple-json", nullable: true })
  applicableMaterials: string[];

  @Column({ name: "downstream_products", type: "simple-json", nullable: true })
  downstreamProducts: string[];

  @OneToMany(() => OpportunityProduct, (product) => product.opportunity, {
    cascade: true,
  })
  details: OpportunityProduct[];

  @OneToMany(() => OpportunityQuote, (quote) => quote.opportunity, {
    cascade: true,
  })
  quotes: OpportunityQuote[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
  @Column({ nullable: true, name: "latest_quote_status" })
  latestQuoteStatus: string; // 用于存储最新状态

  @Column({ nullable: true, name: "latest_quote_date" })
  latestQuoteDate: Date;
}

@Entity("crm_opportunity_quote")
export class OpportunityQuote extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: "times" })
  times: number;

  @Column()
  status: string;

  @Column({ name: "complete_date" })
  completeDate: Date;

  @Column({
    name: "subtotal",
    type: "decimal",
    precision: 12,
    scale: 2,
  })
  subtotal: number;

  @Column({
    name: "discount_rate",
    type: "decimal",
    precision: 12,
    scale: 2,
  })
  discountRate: number;

  @Column({
    name: "total",
    type: "decimal",
    precision: 12,
    scale: 2,
  })
  total: number;

  @ManyToOne(() => Opportunity, (opportunity) => opportunity.quotes)
  @JoinColumn({ name: "opportunity_id" })
  opportunity: Opportunity;

  @OneToMany(() => OpportunityProduct, (detail) => detail.quote, {
    cascade: true,
  })
  products: OpportunityProduct[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

@Entity("crm_opportunity_products")
export class OpportunityProduct extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: "product_category", type: "simple-json", nullable: true })
  productCategory: string[];

  @Column({ name: "product_name", nullable: true })
  productName: string;

  @Column({ name: "config", type: "simple-json", nullable: true })
  config: any;

  @Column({ name: "remark", nullable: true })
  remark: string;

  @Column({ name: "status", nullable: true })
  status: string;

  @Column({
    name: "price",
    type: "decimal",
    precision: 12,
    scale: 2,
    nullable: true,
  })
  price: number;

  @Column({ name: "quantity", type: "decimal", nullable: true })
  quantity: number;

  @Column({
    name: "subtotal",
    type: "decimal",
    precision: 12,
    scale: 2,
    nullable: true,
  })
  subtotal: number;

  @ManyToOne(() => Opportunity, (opportunity) => opportunity.details)
  @JoinColumn({ name: "opportunity_id" })
  opportunity: Opportunity;

  @ManyToOne(() => OpportunityQuote, (opportunity) => opportunity.products)
  @JoinColumn({ name: "quote_id" })
  quote: OpportunityQuote;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
