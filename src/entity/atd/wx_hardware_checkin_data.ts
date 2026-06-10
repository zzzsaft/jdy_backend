import {
  Entity,
  Column,
  BaseEntity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Unique,
} from "typeorm";
import type { Relation } from "typeorm";
import { Checkin } from "./checkin.js";

@Entity({ name: "atd_hardware_checkin_data" })
@Unique(["userid", "unix_checkin_time"])
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
  // @ManyToOne(() => Checkin, (checkin) => checkin.checkin_data)
  // checkin: Relation<Checkin>;

  static async insertRawCheckinData(data: HardwareCheckinData[]) {
    await HardwareCheckinData.createQueryBuilder()
      .insert()
      .into(HardwareCheckinData)
      .values(data)
      .orIgnore()
      .execute();
  }
}
