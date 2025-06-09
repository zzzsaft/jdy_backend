// src/entities/CrmProduct.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  PrimaryColumn,
} from "typeorm";

@Entity("crm_products")
export class Product extends BaseEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: "level1_category" })
  level1Category: string; // 一级产品族

  @Column({ name: "level2_category" })
  level2Category: string; // 二级产品族

  @Column({ name: "level3_category" })
  level3Category: string; // 三级产品族

  @Column({ name: "alias_name", nullable: true })
  aliasName?: string; // 别名

  @Column({ name: "configuration", nullable: true })
  configuration?: string; // 配置

  @Column({ name: "unit", nullable: true })
  unit?: string; // 单位

  @Column({ name: "features", type: "text", nullable: true })
  features?: string; // 特点

  @Column({ name: "application_scenarios", type: "text", nullable: true })
  applicationScenarios?: string; // 应用场景

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
