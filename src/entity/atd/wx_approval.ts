import {
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { ApplyData } from "../../type/wechat/IApproval";
// import app from "../../utils/jdy/app";

const sp_status = {
  1: "审批中",
  2: "已通过",
  3: "已驳回",
  4: "已撤销",
  6: "通过后撤销",
  7: "已删除",
  10: "已支付",
};
const vacation_type = {
  1: "请假",
  2: "补卡",
  3: "出差",
  4: "外出",
  5: "加班",
};
@Entity()
export class Approval extends BaseEntity {
  @PrimaryColumn()
  sp_no: string;

  @Column()
  sp_name: string;

  @Column("varchar")
  sp_status: number | string;

  @Column()
  template_id: string;

  @Column()
  unix_apply_time: number;

  @Column()
  userid: string;

  @Column("jsonb", { array: false })
  sp_record: any[];

  @Column("jsonb", { array: false })
  apply_data: ApplyData[];

  @Column("jsonb", { array: false })
  comments: object[];

  @Column("varchar", { array: true })
  notifyer: string[];

  @Column("timestamp")
  apply_time: Date;

  @Column("date", { nullable: true })
  start_date: Date;
  @Column("date", { nullable: true })
  end_date: Date;
  @Column("timestamp", { nullable: true })
  start_time: Date;
  @Column("timestamp", { nullable: true })
  end_time: Date;
  @Column({ nullable: true })
  vacation_type: string;
  @Column("interval", { nullable: true })
  duration: number;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  @BeforeInsert()
  @BeforeUpdate()
  init() {
    this.sp_status = sp_status[parseInt(this.sp_status.toString())];
    this.apply_time = new Date(this.unix_apply_time * 1000);
    this.apply_data.forEach((item) => {
      if (item.control === "Vacation") {
        const applyData = item as ApplyData<"Vacation">;
        const vacation = applyData.value.vacation;
        const attendance = vacation.attendance;
        this.start_date =
          new Date(attendance.date_range.new_begin * 1000) ?? undefined;
        this.end_date =
          new Date(attendance.date_range.new_end * 1000) ?? undefined;
        this.start_time = this.start_date;
        this.end_time = this.end_date;
        this.duration = attendance.slice_info.duration ?? undefined;
        this.vacation_type = vacation.selector.options[0].value[0].text ?? "";
        if (attendance.date_range.type == "halfday") {
          this.end_time =
            new Date(
              (attendance.date_range.new_begin + this.duration) * 1000
            ) ?? undefined;
        }
      }
      if (item.control === "Attendance") {
        const applyData = item as ApplyData<"Attendance">;
        const attendance = applyData.value.attendance;
        this.start_date =
          new Date(attendance.date_range.new_begin * 1000) ?? undefined;
        this.end_date =
          new Date(attendance.date_range.new_end * 1000) ?? undefined;
        this.start_time =
          new Date(attendance.date_range.new_begin * 1000) ?? undefined;
        this.end_time =
          new Date(attendance.date_range.new_end * 1000) ?? undefined;
        this.duration = attendance.slice_info.duration ?? undefined;
        this.vacation_type = vacation_type[attendance.type] ?? "";
      }
      if (item.control === "PunchCorrection") {
        const applyData = item as ApplyData<"PunchCorrection">;
        const date =
          new Date(applyData.value.punch_correction.time * 1000) ?? undefined;
        this.start_date = date;
        this.end_date = date;
        this.start_time = date;
        this.end_time = date;
        this.vacation_type = "补卡";
      }
    });
  }
}
