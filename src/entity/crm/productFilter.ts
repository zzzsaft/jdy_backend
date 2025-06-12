import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from "typeorm";

@Entity({ name: "crm_product_filter" })
export class Filter extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true, comment: "型号" })
  model: string;

  @Column({ nullable: true, name: "filter_board", comment: "过滤网板" })
  filterBoard: string;

  @Column({ nullable: true, comment: "产量" })
  production: string;

  @Column({ nullable: true, comment: "轮廓尺寸" })
  dimension: string;

  @Column({ nullable: true, comment: "重量" })
  weight: string;

  @Column({ nullable: true, name: "filter_diameter", comment: "滤网直径" })
  filterDiameter: string;

  @Column({
    nullable: true,
    name: "effective_filter_area",
    comment: "过滤有效面积",
  })
  effectiveFilterArea: string;

  @Column({ nullable: true, comment: "功率" })
  power: string;

  @Column({ nullable: true })
  pressure: string;

  @Column({ nullable: true })
  remark: string;
}
