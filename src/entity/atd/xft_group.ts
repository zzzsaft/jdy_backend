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
import { User } from "../basic/employee";
import { Department } from "../basic/department";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
@Entity("atd_xft_group")
export class XftAtdGroup extends BaseEntity {
  @PrimaryColumn()
  groupSeq: string;
  @Column({ nullable: true })
  groupName: string;
  @Column({ nullable: true })
  overtimeSeq: string;
  @Column({ nullable: true })
  groupType: string;
}
