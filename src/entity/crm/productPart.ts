import { Entity, PrimaryColumn, Column, BaseEntity } from "typeorm";

@Entity({ name: "crm_product_part" })
export class ProductPart extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  category: string;

  @Column({
    type: "decimal",
    precision: 12,
    scale: 2,
    nullable: true,
  })
  price: number;

  @Column({ nullable: true })
  unit: string;

  @Column({ type: "char", length: 1 })
  type: "P" | "M";
}

