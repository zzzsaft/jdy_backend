import {
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Between,
  Column,
  CreateDateColumn,
  Entity,
  LessThanOrEqual,
  ManyToOne,
  MoreThanOrEqual,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../basic/employee";
import { Department } from "../basic/department";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { endOfDay } from "date-fns";
@Entity("fbt_apply")
export class FbtApply extends BaseEntity {
  @PrimaryColumn()
  id: string;
  @Column({ nullable: true })
  root_id: string;
  @Column({ nullable: true })
  parent_id: string;
  @Column({ nullable: true })
  code: string;
  @Column({ nullable: true })
  form_id: string;
  @Column({ nullable: true })
  form_name: string;
  @Column({ nullable: true })
  proposer_id: string;
  @Column({ nullable: true })
  proposer_name: string;
  @Column({ name: "proposer_user_id", nullable: true })
  proposerUserId: string;
  @Column({ name: "proposer_user_name", nullable: true })
  proposerUserName: string;
  @Column({ name: "apply_user_id", nullable: true })
  applyUserId: string;
  @Column({ name: "apply_travel", nullable: true, type: "jsonb" })
  appliedTravel: string[];
  @Column({ name: "service_number", nullable: true })
  serviceNumber: string;
  @Column({ nullable: true })
  state: number;
  @Column({ name: "state_name", nullable: true })
  stateName: string;
  @Column({ name: "department_id", nullable: true })
  departmentId: string;
  @Column({ nullable: true, type: "decimal" })
  total_amount: number;
  @Column({ nullable: true, type: "decimal" })
  available_amount: number;
  @Column({ nullable: true })
  create_time: Date;
  @Column({ nullable: true })
  update_time: Date;
  @Column({ nullable: true })
  complete_time: Date;
  @Column({ nullable: true })
  reason: string;
  @Column({ nullable: true })
  remark: string;
  @Column({ nullable: true, type: "timestamp without time zone" })
  start_time: Date;
  @Column({ nullable: true, type: "timestamp without time zone" })
  end_time: Date;
  @Column({ nullable: true })
  duration: string;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(
    () => FbtApplyUser,
    (fbtApplyUser: FbtApplyUser) => fbtApplyUser.apply,
    {
      cascade: true,
      onDelete: "CASCADE",
      orphanedRowAction: "delete",
    }
  )
  user: Relation<FbtApplyUser[]>;

  @OneToMany(
    () => FbtApplyCity,
    (fbtApplyCity: FbtApplyCity) => fbtApplyCity.apply,
    {
      cascade: true,
      onDelete: "CASCADE",
      orphanedRowAction: "delete",
    }
  )
  city: Relation<FbtApplyCity[]>;

  static async addApply(record) {
    const apply: FbtApply = await createRecord(record);
    await apply.save();
    return apply;
  }
  static async updateApply(record) {
    const apply = await createRecord(record);
    await FbtApply.upsert(apply, ["id"]);
  }
  static async getDbApplyWithCityUser(id: string) {
    const fbtApply = await FbtApply.findOne({
      where: { id: id },
      relations: ["city", "user"],
    });
    if (!fbtApply) {
      throw new Error(
        `XftTripLog，getDbApply，Error fetching details for id ${id}`
      );
    }
    return fbtApply;
  }
}

const createRecord = async (record) => {
  const stateName = {
    2: "待审核",
    4: "已同意",
    16: "已拒绝",
    8: "已作废",
    128: "已过期",
    1024: "变更中",
    2048: "已变更",
    512: "已完成",
    64: "撤销",
    65536: "撤回修改中",
  };
  record["proposer_id"] = record["proposer"]["id"];
  record["proposer_name"] = record["proposer"]["name"];
  const trips = record["multi_trips"]?.[0];
  const cars = record["cars"]?.[0];
  const user = await User.findOne({ where: { fbtId: record.proposer_id } });
  const apply = {
    ...record,
    departmentId: user?.main_department_id,
    proposerUserId: user?.user_id,
    proposerUserName: user?.name,
    stateName: stateName[record.state] ?? "未知",
    create_time: new Date(record.create_time),
    form_name: record.name,
  };

  apply["appliedTravel"] = [];
  if (cars) apply["appliedTravel"].push("cars");
  if (trips) apply["appliedTravel"].push("trips");

  if (!record.hasOwnProperty("total_amount")) {
    apply["total_amount"] = trips?.amount;
  }
  if (record.hasOwnProperty("trip_time")) {
    apply["start_time"] = new Date(record.trip_time["start_time"]);
    apply["end_time"] = new Date(record.trip_time["end_time"]);
    apply["duration"] = record.trip_time["duration"];
  } else if (trips) {
    apply["start_time"] = trips?.start_time;
    apply["end_time"] = endOfDay(trips?.end_time);
  } else {
    apply["start_time"] = cars?.start_time;
    apply["end_time"] = endOfDay(cars?.end_time);
  }
  if (record.hasOwnProperty("travel_city_list")) {
    apply["city"] = record.travel_city_list.map((city) => {
      return {
        name: city.value,
        cityId: city.key,
      };
    });
  } else if (trips) {
    apply["city"] = trips.citys.map((city) => {
      return {
        name: city.city_name,
        cityId: city.city_id,
      };
    });
  } else {
    apply["city"] = cars.citys.map((city) => {
      return {
        name: city.city_name,
        cityId: city.city_id,
      };
    });
  }
  apply["user"] = [];
  for (const user of record.users) {
    const u = await User.findOne({ where: { fbtId: user.id } });
    apply["user"].push({
      name: user.name,
      fbtId: user.id,
      userId: u?.user_id,
    });
  }
  apply["serviceNumber"] =
    record.base_controls
      .filter((control) => control.title == "售后单号")?.[0]
      ?.detail?.replaceAll(" ", "") ?? null;

  const applyUser = (apply["applyUserId"] = record.base_controls.filter(
    (control) => control.title == "申请人"
  )?.[0]?.detail);
  if (applyUser) {
    let personnelUserId = JSON.parse(applyUser)["personnelUserId"];
    await User.findOne({
      where: { fbtId: personnelUserId },
      select: ["user_id"],
    }).then((user) => {
      apply["applyUserId"] = user?.user_id;
    });
  }
  return FbtApply.create(apply);
};

@Entity("fbt_apply_user")
export class FbtApplyUser extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @ManyToOne(() => FbtApply, (fbtApply: FbtApply) => fbtApply.user)
  apply: Relation<FbtApply>;
  @Column({ name: "fbt_id", nullable: true })
  fbtId: string;
  @Column({ name: "user_id", nullable: true })
  userId: string;
  @Column()
  name: string;
}

@Entity("fbt_apply_city")
export class FbtApplyCity extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @ManyToOne(() => FbtApply, (fbtApply: FbtApply) => fbtApply.city)
  apply: Relation<FbtApply>;
  @Column({ name: "city_id", nullable: true })
  cityId: string;
  @Column()
  name: string;
  @Column({ nullable: true })
  start_time: Date;
  @Column({ nullable: true })
  end_time: Date;
  @Column({ nullable: true })
  duration: string;
}
