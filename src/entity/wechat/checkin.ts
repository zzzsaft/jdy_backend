import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  Relation,
  AfterLoad,
  BeforeInsert,
  BeforeUpdate,
} from "typeorm";
import AbstractContent from "../AbstractContent";
import { before } from "lodash";

enum CheckinType {
  上午打卡 = "上午打卡",
  下午打卡 = "下午打卡",
  外出打卡 = "外出打卡",
}

enum CheckinState {
  不适用 = "不适用",
  正常 = "正常",
  缺卡 = "缺卡",
  迟到早退 = "迟到/早退",
  正常补卡 = "正常(补卡)",
  迟到补卡 = "迟到(补卡)",
}

@Entity()
export class WechatCheckin extends AbstractContent {
  @Column()
  date: Date;
  @Column()
  name: string;
  @Column({ nullable: true })
  wechat_id: string;
  @Column({ nullable: true })
  company: string;
  @Column({ nullable: true })
  department: string;
  @Column({ nullable: true })
  department_id: string;
  @Column({ nullable: true })
  start_time: Date;
  @Column({ nullable: true })
  end_time: Date;
  @Column({ nullable: true })
  standard_start_time: Date;
  @Column({ nullable: true })
  standard_end_time: Date;
  @Column({
    type: "enum",
    enum: CheckinState,
  })
  start_time_state: CheckinState;
  @Column({
    type: "enum",
    enum: CheckinState,
  })
  end_time_state: CheckinState;
  @Column({
    type: "enum",
    enum: CheckinType,
  })
  checkin_type: CheckinType;
  @Column({ type: "int" })
  late_count: number = 0;
  @Column({ type: "float" })
  absent: number = 0;
  @Column()
  original_checkin_time: string;
  @Column()
  checkin_rule: string;
  @Column()
  is_winter_time: boolean;
  @BeforeInsert()
  CheckinInsert() {}
  @BeforeUpdate()
  CheckinUpdate() {}
}
