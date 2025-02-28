import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "tyc_search" })
export class TycSearch extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: "key_word" })
  keyWord: string;
  @Column({ name: "reg_number" })
  regNumber: string;
  @Column({ name: "reg_status" })
  regStatus: string;
  @Column({ name: "credit_code" })
  creditCode: string;
  @Column({ name: "estiblish_time", type: "date" })
  estiblishTime: Date;
  @Column({ name: "reg_capital" })
  regCapital: string;
  @Column({ name: "company_type" })
  companyType: string;
  @Column()
  name: string;
  @Column()
  company_id: number;
  @Column({ name: "org_number" })
  orgNumber: string;
  @Column()
  type: string;
  @Column()
  base: string;
  @Column({ name: "legal_person_name" })
  legalPersonName: string;
  @Column({ name: "match_type" })
  matchType: string;
  @CreateDateColumn({ name: "created_at", nullable: true })
  createdAt: Date;
}
