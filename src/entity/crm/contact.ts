import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "crm_contact" })
export class Contact extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true, name: "jdy_id", unique: true })
  jdyId: string;

  @Column({ nullable: true, name: "company_id" })
  companyId: string;

  @Column({ nullable: true, name: "company_name" })
  companyName: string;

  @Column({ default: 0 })
  gender: number; // 外部联系人性别 0-未知 1-男性 2-女性

  @Column({ nullable: true })
  position: string; // 外部联系人的职位

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string; // 外部联系人的手机号码

  @Column({ nullable: true, name: "is_key_decision_maker" })
  isKeyDecisionMaker: boolean; // 是否为决策人

  @Column({ nullable: true })
  remark: string; // 外部联系人的备注

  @Column({ nullable: true, name: "creator_id" })
  creatorId: string;

  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;
}
