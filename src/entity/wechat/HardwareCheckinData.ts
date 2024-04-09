import {
  Entity,
  Column,
  BaseEntity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Relation,
} from "typeorm";
import { Checkin } from "./Checkin";

@Entity()
export class HardwareCheckinData extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column("date")
  checkin_date: Date;
  @Column("timestamp")
  checkin_time: Date;
  @Column()
  userid: string;
  @Column("bigint")
  unix_checkin_time: number;
  @Column()
  device_sn: string;
  @Column()
  device_name: string;
  @CreateDateColumn()
  created_at: Date;
  @ManyToOne(() => Checkin, (checkin) => checkin.checkin_data)
  checkin: Relation<Checkin>;
}
