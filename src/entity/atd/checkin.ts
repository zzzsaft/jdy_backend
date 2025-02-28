import { Entity, Column, OneToMany, Relation, Index } from "typeorm";
import AbstractContent from "../AbstractContent";
import { CheckinData } from "./checkin_data";
import { HardwareCheckinData } from "./wx_hardware_checkin_data";

@Entity({ name: "atd_checkin" })
@Index(["userid", "date"], { unique: true })
export class Checkin extends AbstractContent {
  @Column("date")
  date: Date;
  @Column()
  userid: string;

  @OneToMany(() => CheckinData, (checkinData) => checkinData.checkin, {
    cascade: true,
  })
  checkin_data: Relation<CheckinData[]>;
  // @OneToMany(
  //   () => HardwareCheckinData,
  //   (hardwareCheckinData) => hardwareCheckinData.checkin,
  //   {
  //     cascade: true,
  //   }
  // )
  hardware_checkin_data: Relation<HardwareCheckinData[]>;
}
