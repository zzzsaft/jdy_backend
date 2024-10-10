import {
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Between,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  LessThanOrEqual,
  ManyToOne,
  MoreThanOrEqual,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../wechat/User";
import { Department } from "../wechat/Department";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const order_type = {0:'其他',1:'原单',2:'改签单',3:'退单',4:'工单退款'}
const type = {7:'国内机票',40:'国际机票',11:'国内酒店',110:'国际酒店',15:'火车',135:'汽车',3:'用车',60:'用餐',50:'外卖'}
const ticket_type = {1:'原票',2:'改签票',3:'退票',}

const airState = {
  1000:'下单中',
1011:'订单创建失败',
1050:'待审批',
1100:'待支付',
1600:'支付完成',
1211:'已取消',
1400:'已关闭',
1700:'出票中',
1800:'出票成功',
1801:'出票失败',
1810:'退票中',
1811:'退票成功',
1812:'退票失败',
1820:'改签中',
1821:'改签成功',
1823:'改签成功',
1822:'改签失败',
1900:'有退改签',
}

const hotelState = {
  2100:'订单创建中',
2101:'订单创建失败',
2150:'待审批',
2200:'待支付',
2210:'支付中',
2300:'订单取消中',
2301:'已取消',
2402:'订单支付失败',
2410:'寻房失败',
2500:'订房中',
2501:'订房成功',
2502:'订房失败',
2503:'订单取消中',
2504:'已取消',
2700:'已关闭',
2800:'退订成功',
2801:'退订中',
2802:'退订失败',
}

const trainState = {
  3050:'待审批',
3060:'待出票',
3100:'待支付',
3101:'已取消',
3102:'已关闭',
3150:'支付成功',
3201:'出票中',
3202:'出票成功',
3203:'出票失败',
3204:'抢票中',
3205:'取消中',
3206:'占座中',
3207:'占座成功',
3208:'占座失败',
3400:'有退改记录',
3600:'退改进行中',
3700:'改签中',
3701:'占座成功待确认',
3702:'改签已确认',
3703:'改签成功',
3704:'改签失败',
3705:'改签取消',
3706:'已提交改签待出票',
3707:'改签占座中',
3708:'改签待支',
3709:'改签占座失败',
3800:'退票中',
3801:'退票成功',
3802:'退票失败',
3803:'退票成功退款中',
'-256':'已删除',
}
const taxiState = {
  '-256':'已删除',
100:'创建中',
200:'待支付',
201:'已取消（预支付超时未支付）',
210:'支付成功',
300:'等待应答',
311:'订单超时',
350:'预约成功',
351:'预约失败',
355:'改派中',
360:'派单成功',
400:'等待接驾',
410:'司机已到达',
500:'行程中',
600:'行程结束',
601:'待支付（有取消费，用户取消待支付）',
602:'待支付（有取消费，司机取消待支付）',
610:'已取消（手动取消）',
611:'司机取消',
650:'费用待确认',
680:'企业待支付',
690:'因公订单员工待支付',
691:'因私订单个人待支付',
692:'敏感订单待支付',
700:'已完成',
800:'退款中',
880:'退款成功',
890:'退款失败',
}
@Entity("fbt_order")
export class FbtOrder extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  apply_id: string;
  @Column({ nullable: true })
  order_id: string;
  @Column({ nullable: true })
  order_status: number;
  @Column({ nullable: true })
  order_status_name: string;
  @Column({ nullable: true })
  order_type: number;
  @Column({ nullable: true })
  order_type_name: string;
  @Column({ nullable: true })
  type: number;
  @Column({ nullable: true })
  type_name: string;
  @Column({ nullable: true })
  ticket_id: string;
  @Column({ nullable: true })
  ticket_type: string;
  @Column({ nullable: true })
  ticket_type_name: string;

  @OneToOne(() => FbtOrderInfo, { cascade: true })
  @JoinColumn()
  fbtOrderInfo: FbtOrderInfo

  @OneToOne(() => FbtOrderPrice, { cascade: true })
  @JoinColumn()
  fbtOrderPrice: FbtOrderPrice

  @OneToOne(() => FbtOrderAirTrip, { cascade: true })
  @JoinColumn()
  fbtOrderAirTrip: FbtOrderAirTrip

  @OneToOne(() => FbtOrderHotelTrip, { cascade: true })
  @JoinColumn()
  fbtOrderHotelTrip: FbtOrderHotelTrip

  @OneToOne(() => FbtOrderTaxiTrip, { cascade: true })
  @JoinColumn()
  fbtOrderTaxiTrip: FbtOrderTaxiTrip

  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  static createOrder(apply_id: string, orderRecord: any): FbtOrder[] {
    const result: FbtOrder[] = [];
    const order = new FbtOrder();

    // 设置订单的基本信息
    order.apply_id = apply_id;
    order.order_id = orderRecord.id;
    order.order_type = orderRecord.order_type_name;
    order.order_type_name = order_type[orderRecord.order_type] ?? '';
    order.type = orderRecord.type;
    order.type_name = type[orderRecord.type_name] ?? '';
    order.order_status = orderRecord.order_status;
    order.order_status_name = this.getOrderStatusName(orderRecord);

    // 检查票务信息
    if (Object.prototype.hasOwnProperty.call(orderRecord, 'tickets')) {
        for (const ticket of orderRecord['tickets']) {
            const orderWithTicket = this.createOrderWithTicket(order, ticket);
            result.push(orderWithTicket);
        }
    } else {
      result.push(order);
    }
    return result;
}
  // 获取订单状态名称的辅助方法
private static getOrderStatusName(orderRecord: any): string {
  switch (orderRecord.type) {
      case 7:
      case 40:
          return airState[orderRecord.order_status] ?? '';
      case 11:
      case 110:
          return hotelState[orderRecord.order_status] ?? '';
      case 15:
          return trainState[orderRecord.order_status] ?? '';
      case 3:
          return taxiState[orderRecord.order_status] ?? '';
      default:
          return '';
  }
}
  // 创建带票务信息的订单
private static createOrderWithTicket(order: FbtOrder, ticket: any): FbtOrder {
  const orderWithTicket = new FbtOrder();
  Object.assign(orderWithTicket, order);
  orderWithTicket.ticket_id = ticket.id;
  orderWithTicket.ticket_type = ticket.type;
  orderWithTicket.ticket_type_name = ticket_type[ticket.type] ?? '';
  return orderWithTicket;
}

// 检查订单是否存在
private static async checkOrderExists(order: FbtOrder): Promise<FbtOrder | null> {
  return await FbtOrder.findOne({ where: { order_id: order.order_id, ticket_id: order.ticket_id } });
}
}

@Entity("fbt_order_info")
export class FbtOrderInfo extends BaseEntity {
  @PrimaryColumn()
  order_id: string;
  @PrimaryColumn()
  ticket_id: string;
  @Column({ nullable: true })
  ticket_type: string;
  @Column({ nullable: true })
  root_id: string;
  @Column({ nullable: true })
  pre_id: string;
  @Column({ nullable: true })
  start_time: Date;
  @Column({ nullable: true })
  end_time: Date;
  @Column({ nullable: true })
  order_state: number;
  @Column({ name: "order_state_name", nullable: true })
  orderStateName: string;

  @Column({ nullable: true })
  proposer_id: string;
  @Column({ nullable: true })
  proposer_name: string;
  @Column({ name: "proposer_user_id", nullable: true })
  proposerUserId: string;
  @Column({ name: "proposer_user_name", nullable: true })
  proposerUserName: string;
  @Column({ name: "service_number", nullable: true })
  serviceNumber: string;
  @Column({ name: "department_id", nullable: true })
  departmentId: string;
  

  @Column({ nullable: true })
  insurance: boolean;
  @Column({ nullable: true })
  source: string;
  @Column({ nullable: true })
  create_time: Date;
  @Column({ nullable: true })
  update_time: Date;
  @Column({ nullable: true })
  bill_code: string;
  @Column({ nullable: true })
  pre_ticket_id: string;
  @Column({ nullable: true })
  root_ticket_id: string;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  // @OneToMany(
  //   () => FbtApplyUser,
  //   (fbtApplyUser: FbtApplyUser) => fbtApplyUser.apply,
  //   {
  //     cascade: true,
  //     onDelete: "CASCADE",
  //     orphanedRowAction: "delete",
  //   }
  // )
  // user: Relation<FbtApplyUser[]>;

  // @OneToMany(
  //   () => FbtApplyCity,
  //   (fbtApplyCity: FbtApplyCity) => fbtApplyCity.apply,
  //   {
  //     cascade: true,
  //     onDelete: "CASCADE",
  //     orphanedRowAction: "delete",
  //   }
  // )
  // city: Relation<FbtApplyCity[]>;

  // static async addApply(record) {
  //   const apply = await createRecord(record);
  //   await apply.save();
  // }
  // static async updateApply(record) {
  //   const apply = await createRecord(record);
  //   await FbtApply.upsert(apply, ["id"]);
  // }
}

// const createRecord = async (record) => {
//   const stateName = {
//     2: "待审核",
//     4: "已同意",
//     16: "已拒绝",
//     8: "已作废",
//     128: "已过期",
//     1024: "变更中",
//     2048: "已变更",
//     512: "已完成",
//     64: "撤销",
//     65536: "撤回修改中",
//   };
//   record["proposer_id"] = record["proposer"]["id"];
//   record["proposer_name"] = record["proposer"]["name"];
//   const trips = record["multi_trips"][0];
//   const user = await User.findOne({ where: { fbtId: record.proposer_id } });
//   const apply = {
//     ...record,
//     departmentId: user?.main_department_id,
//     proposerUserId: user?.user_id,
//     proposerUserName: user?.name,
//     stateName: stateName[record.state] ?? "未知",
//     create_time: new Date(record.create_time),
//     form_name: record.name,
//   };
//   if (!record.hasOwnProperty("total_amount")) {
//     apply["total_amount"] = trips?.amount;
//   }
//   if (record.hasOwnProperty("trip_time")) {
//     apply["start_time"] = new Date(record.trip_time["start_time"]);
//     apply["end_time"] = new Date(record.trip_time["end_time"]);
//     apply["duration"] = record.trip_time["duration"];
//   } else {
//     apply["start_time"] = trips?.start_time;
//     apply["end_time"] = trips?.end_time;
//   }
//   if (record.hasOwnProperty("travel_city_list")) {
//     apply["city"] = record.travel_city_list.map((city) => {
//       return {
//         name: city.value,
//         cityId: city.key,
//       };
//     });
//   } else {
//     apply["city"] = trips.citys.map((city) => {
//       return {
//         name: city.city_name,
//         cityId: city.city_id,
//       };
//     });
//   }
//   apply["user"] = [];
//   for (const user of record.users) {
//     const u = await User.findOne({ where: { fbtId: user.id } });
//     apply["user"].push({
//       name: user.name,
//       fbtId: user.id,
//       userId: u?.user_id,
//     });
//   }
//   apply["serviceNumber"] =
//     record.base_controls
//       .filter((control) => control.title == "售后单号")?.[0]
//       ?.detail?.replaceAll(" ", "") ?? null;
//   return FbtApply.create(apply);
// };

// @Entity("fbt_apply_user")
// export class FbtApplyUser extends BaseEntity {
//   @PrimaryGeneratedColumn()
//   id: number;
//   @ManyToOne(() => FbtApply, (fbtApply: FbtApply) => fbtApply.user)
//   apply: Relation<FbtApply>;
//   @Column({ name: "fbt_id", nullable: true })
//   fbtId: string;
//   @Column({ name: "user_id", nullable: true })
//   userId: string;
//   @Column()
//   name: string;
// }

@Entity("fbt_order_price")
export class FbtOrderPrice extends BaseEntity {
  @PrimaryColumn()
  order_id: string;
  // @ManyToOne(() => FbtApply, (fbtApply: FbtApply) => fbtApply.city)
  // apply: Relation<FbtApply>;
  @Column({ type: "decimal", nullable: true })
  corporate: number;
  @Column({ type: "decimal", nullable: true })
  amount_company: number;
  @Column({ type: "decimal", nullable: true })
  red_envelope: number;
  @Column({ type: "decimal", nullable: true })
  personal: number;
  @Column({ type: "decimal", nullable: true })
  order: number;
  @Column({ type: "decimal", nullable: true })
  sale: number;
  @Column({ type: "decimal", nullable: true })
  dispatch: number;
  @Column({ type: "decimal", nullable: true })
  fbb: number;
  @Column({ type: "decimal", nullable: true })
  taxe: number;
  @Column({ type: "decimal", nullable: true })
  insurance: number;
  @Column({ type: "decimal", nullable: true })
  coupon: number;
  @Column({ type: "decimal", nullable: true })
  rebook: number;
  @Column({ type: "decimal", nullable: true })
  rebook_service: number;
  @Column({ type: "decimal", nullable: true })
  grab_ticket: number;
  @Column({ type: "decimal", nullable: true })
  refund: number;
  @Column({ type: "decimal", nullable: true })
  corporate_surplus: number;
  @Column({ type: "decimal", nullable: true })
  grab_service_fee: number;
  @Column({ type: "decimal", nullable: true })
  grab_service_fee_company: number;
  @Column({ type: "decimal", nullable: true })
  grab_service_fee_personal: number;
  @Column({ nullable: true })
  grab_service_fee_pay_type: number;
  @Column({ type: "decimal", nullable: true })
  infrastructure: number;
  @Column({ type: "decimal", nullable: true })
  fuel: number;
  @Column({ type: "decimal", nullable: true })
  upgrade: number;
  @Column({ type: "decimal", nullable: true })
  discount: number;
  @Column({ type: "decimal", nullable: true })
  total_taxi: number;
  @Column({ type: "jsonb", nullable: true })
  taxi_detail: { name: string; amount: number }[];
}

@Entity("fbt_order_air_trip")
export class FbtOrderAirTrip extends BaseEntity {
  @PrimaryColumn()
  order_id: string;
  @Column({ nullable: true })
  trip_id: string;
  @Column({ nullable: true })
  third_id: string;
  @Column({ nullable: true })
  international_air: boolean;
  @Column({ nullable: true })
  start_airport: string;
  @Column({ nullable: true })
  end_airport: string;
  @Column({ nullable: true })
  start_city_name: string;
  @Column({ nullable: true })
  start_city_id: string;
  @Column({ nullable: true })
  end_city_name: string;
  @Column({ nullable: true })
  end_city_id: string;
  @Column({ nullable: true })
  airline_name: string;
  @Column({ nullable: true })
  flight_code: string;
  @Column({ nullable: true })
  flight_type: string;
  @Column({ nullable: true })
  start_time: Date;
  @Column({ nullable: true })
  end_time: Date;
  @Column({ nullable: true })
  cabin: string;
  @Column({ nullable: true })
  cabin_rank: string;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;
}

@Entity("fbt_order_hotel_trip")
export class FbtOrderHotelTrip extends BaseEntity {
  @PrimaryColumn()
  order_id: string;
  @Column({ nullable: true })
  trip_id: string;
  @Column({ nullable: true })
  third_id: string;
  @Column({ nullable: true })
  hotel_name: string;
  @Column({ nullable: true })
  hotel_phone: string;
  @Column({ nullable: true })
  hotel_address: string;
  @Column({ nullable: true })
  hotel_rank: string;
  @Column({ nullable: true })
  city_name: string;
  @Column({ nullable: true })
  city_id: string;
  @Column({ nullable: true })
  check_in_time: Date;
  @Column({ nullable: true })
  check_out_time: Date;
  @Column({ nullable: true })
  room_type: string;
  @Column({ nullable: true })
  room_number: string;
  @Column({ nullable: true })
  breakfast: string;
  @Column({ nullable: true })
  cross_day: string;
  @Column({ type: "jsonb", nullable: true })
  per_nights: { date: Date; price: number }[];
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;
}

@Entity("fbt_order_taxi_trip")
export class FbtOrderTaxiTrip extends BaseEntity {
  @PrimaryColumn()
  order_id: string;
  @Column({ nullable: true })
  trip_id: string;
  @Column({ nullable: true })
  third_id: string;
  @Column({ nullable: true })
  start_city_name: string;
  @Column({ nullable: true })
  start_city_id: string;
  @Column({ nullable: true })
  start_location: string;
  @Column({ nullable: true })
  start_address: string;
  @Column({ nullable: true })
  end_city_name: string;
  @Column({ nullable: true })
  end_city_id: string;
  @Column({ nullable: true })
  end_location: string;
  @Column({ nullable: true })
  end_address: string;
  @Column({ nullable: true })
  start_time: Date;
  @Column({ nullable: true })
  end_time: Date;
  @Column({ nullable: true })
  taxi_type: string;
  @Column({ nullable: true })
  actual_distance: string;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;
}
