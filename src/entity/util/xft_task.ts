import {
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Between,
  Column,
  CreateDateColumn,
  Entity,
  LessThanOrEqual,
  MoreThanOrEqual,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("xft_task")
export class XftTask extends BaseEntity {
  @PrimaryColumn()
  id: string;
  @Column({ nullable: true })
  details: string;
  @Column({ nullable: true })
  dealStatus: string;
  @Column({ nullable: true })
  receiver: string;
  @Column({ nullable: true })
  receiverId: string;
  @Column({ nullable: true })
  sendUser: string;
  @Column({ nullable: true })
  sendUserId: string;
  @Column({ nullable: true })
  isSent0: boolean = false;
  @Column({ nullable: true })
  isSent1: boolean = false;
  @Column({ nullable: true })
  isSent2: boolean = false;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;
}
