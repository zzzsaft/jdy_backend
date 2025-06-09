import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from "typeorm";

@Entity("crm_product_filter")
export class Filter extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true, name: "filter_board" })
  filterBoard: string;

  @Column({ nullable: true })
  production: string;

  @Column({ nullable: true })
  dimension: string;

  @Column({ nullable: true })
  weight: string;

  @Column({ nullable: true, name: "filter_diameter" })
  filterDiameter: string;

  @Column({ nullable: true, name: "effective_filter_area" })
  effectiveFilterArea: string;

  @Column({ nullable: true })
  power: string;

  @Column({ nullable: true })
  remark: string;
}
