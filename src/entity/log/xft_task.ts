import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "abnormal_traffic" })
export class AbnomalTraffic extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userid: string;

  @Column({ nullable: true })
  name: string;

  @Column({ name: "entry_id" })
  entryId: number;

  @Column({ nullable: true, name: "in_date" })
  inDate: Date;

  @Column({ nullable: true, name: "out_date" })
  outDate: Date;

  @Column({ name: "user_sent" })
  userSent: boolean = false;

  @Column({ name: "leader_sent" })
  leaderSent: boolean = false;

  @Column({ name: "hr_sent" })
  hrSent: boolean = false;

  @Column({ nullable: true, type: "interval" })
  interval: number;

  @Column({ nullable: true, name: "approval_type" })
  approvalType: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
