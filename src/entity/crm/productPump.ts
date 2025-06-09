// src/entities/CrmProduct.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from "typeorm";

@Entity("crm_products_pump")
export class Pump extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  pumpage: string;

  @Column({ nullable: true, name: "heating_power" })
  heatingPower: string;

  @Column({ name: "rotate_speed", nullable: true })
  rotateSpeed: string;

  @Column({ name: "shear_sensitivity", nullable: true })
  shearSensitivity: string;

  @Column({ nullable: true })
  production: string;

  @Column({ nullable: true })
  remark: string;
}
