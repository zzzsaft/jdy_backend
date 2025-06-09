import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
import AbstractContent from "../AbstractContent";

@Entity({ name: "crm_customer" })
export class Customer extends AbstractContent {
  @Column({ name: "jdy_id", unique: true })
  jdyId: string;
  @Column({ name: "name" })
  name: string;
  @Column({ name: "erp_id" })
  erpId: string;
  @Column({ name: "charger_id", nullable: true })
  chargerId: string;
  @Column({ name: "charger", nullable: true })
  charger: string;
  @Column({ name: "supporter", nullable: true })
  supporter: string;
  @Column({ name: "supporter_id", nullable: true })
  supporterId: string;
  @Column({ name: "type", nullable: true })
  type: string;
  @Column({ name: "industry", type: "simple-array", nullable: true })
  industry: string[];
  @Column({ name: "product", type: "simple-array", nullable: true })
  product: string[];
  @Column({ name: "collaborator_id", type: "simple-array", nullable: true })
  collaboratorId: string[];
  @Column({ name: "collaborator", type: "simple-array", nullable: true })
  collaborator: string[];
  @Column({ nullable: true })
  address: string;
}
