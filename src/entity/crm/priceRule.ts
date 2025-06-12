import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from "typeorm";

@Entity({ name: "crm_price_rule" })
export class PriceRule extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column("simple-array", { name: "product_category", nullable: true })
  productCategory: string[];

  @Column({ nullable: true })
  field?: string;

  @Column()
  operator: string;

  @Column({ nullable: true })
  value?: string;

  @Column("jsonb", { nullable: true })
  step?: { interval: number; amount: number };

  @Column("text", { nullable: true })
  code?: string;

  @Column("decimal", { precision: 10, scale: 2, default: 0 })
  addition: number;
}
