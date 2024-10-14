import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  PrimaryColumn,
  LessThanOrEqual,
  MoreThanOrEqual,
  UpdateDateColumn,
  CreateDateColumn,
  Unique,
} from "typeorm";

@Entity({ name: "atd_business_trip" })
export class BusinessTrip extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "xft_form_id", unique: true, nullable: true })
  xftFormId: string;

  @Column({ name: "fbt_root_id", unique: true, nullable: true })
  fbtRootId: string;

  @Column({ name: "xft_bill_id", nullable: true, unique: true })
  xftBillId: string;

  @Column({ name: "fbt_current_id", nullable: true })
  fbtCurrentId: string;

  @Column({ name: "user_id", nullable: true })
  userId: string;

  @Column({ name: "is_sync", nullable: true })
  isSync: boolean;

  @Column({ nullable: true })
  create_time: Date;

  @Column({ nullable: true })
  start_time: Date;

  @Column({ nullable: true })
  end_time: Date;

  @Column({ type: "jsonb", nullable: true })
  city: string[];

  @Column({ nullable: true })
  source: string;

  @Column({ nullable: true })
  reason: string;

  @Column({ nullable: true })
  remark: string;

  @Column({ nullable: true })
  customer: string;

  @Column({ nullable: true })
  err: string;

  @Column({ name: "revise_log", nullable: true })
  reviseLog: string;

  @Column({ type: "jsonb", name: "revise_logs", nullable: true })
  reviseLogs: string[];

  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  static async addRecord(
    fbtRootId: string,
    currentId: string,
    xftBillId:
      | {
          billId: any;
          error?: undefined;
        }
      | {
          error: any;
          billId?: undefined;
        },
    createTime: Date
  ) {
    const record = new BusinessTrip();
    record.fbtRootId = fbtRootId;
    if (xftBillId.billId) {
      record.xftBillId = xftBillId.billId;
    } else {
      record.err = xftBillId.error;
    }
    record.fbtCurrentId = currentId;
    record.create_time = createTime;
    if (xftBillId.billId) {
      record.isSync = true;
    }
    await record.save();
  }

  static async getConflict(
    userId: string,
    start_time: Date,
    end_time: Date,
    create_time: Date
  ) {
    const conflicts = await BusinessTrip.find({
      where: [
        {
          userId,
          start_time: LessThanOrEqual(end_time),
          end_time: MoreThanOrEqual(start_time),
          create_time: LessThanOrEqual(create_time),
        },
      ],
      select: ["start_time", "end_time", "fbtRootId"],
    });
    return conflicts;
  }

  static async addRecordFromXFT({
    userId,
    startTime,
    xftFormId,
    endTime,
    city,
    reason,
    remark,
    customer,
  }: {
    userId: string;
    startTime: Date | null;
    xftFormId: string;
    endTime: Date | null;
    city: string[];
    reason: string;
    remark: string;
    customer: string;
  }) {
    const exist = await BusinessTrip.exists({ where: { xftFormId } });
    if (exist) return null;

    const record = new BusinessTrip();
    if (startTime) record.start_time = startTime;
    if (endTime) record.end_time = endTime;
    record.userId = userId;
    record.xftFormId = xftFormId;
    record.city = city;
    record.reason = reason;
    record.source = "薪福通";
    record.remark = remark;
    record.customer = customer;
    record.err = "";
    await record.save();
  }
}
