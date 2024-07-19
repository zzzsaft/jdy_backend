// import {
//   BaseEntity,
//   Column,
//   CreateDateColumn,
//   Entity,
//   PrimaryColumn,
// } from "typeorm";
// import { logger } from "../../config/logger";

// @Entity({name: "visitor_info"})
// export class VisitorInfo extends BaseEntity {
//   @PrimaryColumn()
//   id: string;
//   @Column({ name: "user_id" })
//   guestCompany: string;
//   @Column({ name: "name", nullable: true })
//   guestType: string;
//   @Column({ name: "phone", nullable: true })
//   inviteStatus: string;
//   @Column({ name: "car_num", nullable: true })
//   visitorCarNum: string;
//   @Column({ name: "license_plate_color", nullable: true })
//   visitorLeaveTime: string;
//   @Column({ name: "begin_time", nullable: true })
//   visitorName: Date;
//   @Column({ name: "end_time", nullable: true })
//   visitorPhone: Date;
//   @CreateDateColumn({ name: "created_at", nullable: true })
//   visitorTime: Date;

//   static async addInfo(info: ParkingInfoType) {
//     try {
//       const newRecord = ParkingInfo.create({
//         id: info.id,
//         ownerId: info.ownerId,
//         ownerName: info.ownerName,
//         ownerPhone: info.ownerPhone,
//         carNum: info.carNum,
//         licensePlateColor: info.licensePlateColor,
//         beginTime: new Date(info.beginTime),
//         endTime: new Date(info.endTime),
//       });
//       await ParkingInfo.save(newRecord);
//       return newRecord;
//     } catch (e) {
//       logger.error(e);
//       logger.error(info);
//     }
//   }
//   static async updateInfo(info: ParkingInfoType) {
//     try {
//       await ParkingInfo.update(
//         { id: info.id },
//         {
//           ownerId: info.ownerId,
//           ownerName: info.ownerName,
//           ownerPhone: info.ownerPhone,
//           carNum: info.carNum,
//           licensePlateColor: info.licensePlateColor,
//           beginTime: new Date(info.beginTime),
//           endTime: new Date(info.endTime),
//         }
//       );
//     } catch (e) {
//       logger.error(e);
//       logger.error(info);
//     }
//   }
//   static async getInfoByCarNum(carNum: string) {
//     return await ParkingInfo.findOne({ where: { carNum: carNum } });
//   }
//   static async test() {
//     // await ParkingInfo.addInfo({
//     //   id: "1",
//     //   ownerId: "1",
//     //   ownerName: "Owner 1",
//     //   ownerPhone: "1234567890",
//     //   carNum: "Car 1",
//     //   licensePlateColor: "Blue",
//     //   beginTime: "2022-01-01T08:00:00",
//     //   endTime: "2022-01-01T10:00:00",
//     // });

//     // await ParkingInfo.updateInfo({
//     //   id: "1",
//     //   ownerId: "2",
//     //   ownerName: "Owner 1",
//     //   ownerPhone: "1234567890",
//     //   carNum: "Car 1",
//     //   licensePlateColor: "Red",
//     //   beginTime: "2022-01-01T08:00:00",
//     //   endTime: "2022-01-01T10:00:00",
//     // });
//     console.log(await ParkingInfo.getInfoByCarNum("Car 1"));
//   }
// }
