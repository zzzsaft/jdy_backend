import { IsNull } from "typeorm";
import { parkingApiClient } from "../api/app";
import { logger } from "../../../config/logger";
import { ParkingInfo } from "../entity/vehicle_info";
import { format } from "date-fns";
import { jdyFormDataApiClient } from "../../jdy/api/form_data";
import { User } from "../../../entity/basic/employee";
import { defaultWechatCorpConfig } from "../../wechat/wechatCorps";
import { isTaskFinished } from "../../../controllers/jdy/jdyUtil";
import { MessageService } from "../../../features/wechat/service/messageService";

class VehicleService {
  createCarInfo(carInfo: {
    carNum;
    carOwner;
    phone;
    licensePlateColor;
    beginTime;
    endTime;
    userId;
    type;
    brand;
  }) {
    return ParkingInfo.create({
      carNum: carInfo.carNum,
      ownerName: carInfo.carOwner,
      ownerPhone: carInfo.phone,
      licensePlateColor: carInfo.licensePlateColor,
      beginTime: carInfo.beginTime,
      endTime: carInfo.endTime,
      ownerId: carInfo.userId,
      type: carInfo.type,
      brand: carInfo.brand,
      isActive: true,
    });
  }
  addCarPlate = async (carInfo: {
    carNum;
    carOwner;
    phone;
    licensePlateColor;
    beginTime;
    endTime;
    userId;
    type;
    brand;
  }) => {
    const info = await this.getCarPlate(carInfo);
    const payload = { ...carInfo, area: "dream" };
    const result = await parkingApiClient.addCar(payload);
    if (result["success"]) {
      info.xinQianId = result?.["result"]?.["id"];
    } else {
      logger.error(result);
    }
    payload.area = "chengjiang";
    const result2 = await parkingApiClient.addCar(payload);
    if (result["success"]) {
      info.chengJiangId = result2?.["result"]?.["id"];
    } else {
      logger.error(result);
    }
    return await info.save();
  };
  getCarPlate = async (carInfo: {
    carNum;
    carOwner;
    phone;
    licensePlateColor;
    beginTime;
    endTime;
    userId;
    type;
    brand;
  }) => {
    const info = await ParkingInfo.findOne({
      where: {
        carNum: carInfo.carNum,
      },
    });
    if (info) {
      return info;
    }
    return await this.createCarInfo(carInfo).save();
  };
  updateCarPlate = async (carInfo: {
    carNum;
    carOwner;
    phone;
    licensePlateColor;
    beginTime;
    endTime;
    userId;
    type;
    brand;
  }) => {
    const info = await this.getCarPlate(carInfo);
    if (!info.id) {
      logger.error(`carinfo not found${JSON.stringify(carInfo)}`);
      return;
    }
    if (info.xinQianId)
      await parkingApiClient.updateCar({
        id: info.xinQianId,
        ...carInfo,
      });
    if (info.chengJiangId)
      await parkingApiClient.updateCar({
        id: info.chengJiangId,
        ...carInfo,
      });
    ParkingInfo.merge(info, this.createCarInfo(carInfo));
    await info.save();
  };

  syncMissingCarIdFromJdy = async () => {
    const formId = jdyFormDataApiClient.getFormId("车辆信息登记");
    const fields = [
      "_id",
      "_widget_1720515048363", // 车辆id
      "_widget_1720515048364", // 车牌号（大写）
      "_widget_1720546356355", // 车牌号
      "_widget_1720515048366", // 姓名
      "_widget_1720515048369", // 车主电话
      "_widget_1720515048370", // 开始日期
      "_widget_1720515048371", // 截止日期
      "_widget_1720677256474", // 车牌颜色
      "_widget_1720515048365", // 人员id
      "_widget_1721320851863", // 车辆类型
      "_widget_1721320993137", // 品牌
    ];
    const data = await jdyFormDataApiClient.batchDataQuery(
      formId.appid,
      formId.entryid,
      {
        fields,
        filter: {
          rel: "and",
          cond: [
            {
              field: "_widget_1720515048363",
              method: "empty",
            },
          ],
        },
        limit: 100,
      }
    );
    for (const item of data) {
      const carNum =
        item["_widget_1720515048364"] || item["_widget_1720546356355"];
      if (!carNum) {
        logger.error(`carNum missing in jdy: ${JSON.stringify(item)}`);
        continue;
      }
      const beginTimeRaw = item["_widget_1720515048370"];
      const endTimeRaw = item["_widget_1720515048371"];
      const beginTime = beginTimeRaw
        ? format(new Date(beginTimeRaw), "yyyy-MM-dd")
        : "";
      const endTime = endTimeRaw
        ? format(new Date(endTimeRaw), "yyyy-MM-dd")
        : "";
      const result = await this.addCarPlate({
        carNum,
        carOwner: item["_widget_1720515048366"],
        phone: item["_widget_1720515048369"],
        licensePlateColor: item["_widget_1720677256474"] ?? "蓝色",
        beginTime,
        endTime,
        userId: item["_widget_1720515048365"],
        type: item["_widget_1721320851863"],
        brand: item["_widget_1721320993137"],
      });
      if (result?.xinQianId) {
        await jdyFormDataApiClient.singleDataUpdate(
          formId.appid,
          formId.entryid,
          item["_id"],
          {
            _widget_1720515048363: { value: result.xinQianId },
          }
        );
      }
    }
  };

  disableCarIfUserLeft = async () => {
    const users = await User.find({
      where: { is_employed: false, corp_id: defaultWechatCorpConfig.corpId },
      select: ["user_id"],
    });
    const userIds = users.map((u) => u.user_id).filter((id) => id);
    if (userIds.length === 0) return;

    const plates = await ParkingInfo.createQueryBuilder("parking")
      .where("parking.ownerId IN (:...userIds)", { userIds })
      .andWhere("parking.isActive != :disabled", { disabled: false })
      .getMany();
    if (plates.length === 0) return;

    for (const plate of plates) {
      if (plate.xinQianId) {
        await parkingApiClient.deleteCar(plate.xinQianId);
      }
      if (plate.chengJiangId) {
        await parkingApiClient.deleteCar(plate.chengJiangId);
      }
      const formId = jdyFormDataApiClient.getFormId("车辆信息登记");
      const cond: any = [
        {
          field: "_widget_1720515048365",
          method: "eq",
          value: [plate.ownerId],
        },
      ];
      if (plate.carNum) {
        cond.push({
          field: "_widget_1720515048364",
          method: "eq",
          value: [plate.carNum],
        });
      }
      const data = await jdyFormDataApiClient.batchDataQuery(
        formId.appid,
        formId.entryid,
        {
          fields: ["_id"],
          filter: { rel: "and", cond },
          limit: 100,
        }
      );
      for (const item of data) {
        await jdyFormDataApiClient.singleDataRemove(
          formId.appid,
          formId.entryid,
          item["_id"]
        );
      }
      plate.isActive = false;
      await plate.save();
    }
  };

  addCar = async (data) => {
    const carNum = data["_widget_1720515048364"];
    const carOwner = data["_widget_1720515048366"];
    const phone = data["_widget_1720515048369"];
    const beginTime = format(
      new Date(data["_widget_1720515048370"]),
      "yyyy-MM-dd"
    );
    const endTime = format(
      new Date(data["_widget_1720515048371"]),
      "yyyy-MM-dd"
    );
    const licensePlateColor = data["_widget_1720677256474"] ?? "蓝色";
    const brand = data["_widget_1721320993137"];
    const type = data["_widget_1721320851863"];

    const userId = data["_widget_1720515048365"];
    const result = await this.addCarPlate({
      carNum,
      carOwner,
      phone,
      licensePlateColor,
      beginTime,
      endTime,
      userId,
      type,
      brand,
    });
    const id = jdyFormDataApiClient.getFormId("车辆信息登记");
    await jdyFormDataApiClient.singleDataUpdate(
      id.appid,
      id.entryid,
      data._id,
      {
        _widget_1720515048363: { value: result.xinQianId },
      }
    );
  };

  updateCar = async (data) => {
    const id = data["_widget_1720515048363"];
    const carNum = data["_widget_1720515048364"];
    const carOwner = data["_widget_1720515048366"];
    const phone = data["_widget_1720515048369"];
    const beginTime = format(
      new Date(data["_widget_1720515048370"]),
      "yyyy-MM-dd"
    );
    const endTime = format(
      new Date(data["_widget_1720515048371"]),
      "yyyy-MM-dd"
    );
    const licensePlateColor = data["_widget_1720677256474"] ?? "蓝色";
    const userId = data["_widget_1720515048365"];
    if (!id) return;
    await this.updateCarPlate({
      carNum,
      carOwner,
      phone,
      licensePlateColor,
      beginTime,
      endTime,
      userId,
      type: data["_widget_1721320851863"],
      brand: data["_widget_1721320993137"],
    });
  };

  deleteCar = async (data) => {
    const id = data["_widget_1720515048363"];
    if (id) {
      await parkingApiClient.deleteCar(id);
      const record =
        (await ParkingInfo.findOne({ where: { xinQianId: id } })) ??
        (await ParkingInfo.findOne({ where: { chengJiangId: id } }));
      if (record) {
        record.isActive = false;
        await record.save();
      }
    }
  };

  punishCar = async (data) => {
    if (!(await isTaskFinished(data._id))) {
      return;
    }
    const punish = data["_widget_1720526149443"];
    const plate_num = data["_widget_1720526149437"];
    const reason = data["_widget_1720526149442"];
    let punishDate = 0;
    if (punish === "警告") {
      punishDate = 0;
    } else if (punish === "三天") {
      punishDate = 3;
    } else if (punish === "一周") {
      punishDate = 7;
    } else if (punish === "一月") {
      punishDate = 30;
    }
    const beginTime = format(
      new Date(Date.now() + punishDate * 24 * 60 * 60 * 1000),
      "yyyy-MM-dd"
    );
    if (punishDate != 0) {
      await parkingApiClient.updateCar({
        id: data["_widget_1720526149436"],
        beginTime: beginTime,
        endTime: "2028-12-31",
        userId: data["_widget_1720526149438"],
      });
    }
    const msg = new MessageService([data["_widget_1720526149438"]]);
    await msg.send_plain_text(
      `您的车辆${plate_num}因${reason}已被停车场处罚，处罚结果为${punish}，下次可停车时间为${beginTime}`
    );
  };
}

export const vehicleService = new VehicleService();

export const addChengJiangCar = async () => {
  const plates = await ParkingInfo.find({ where: { chengJiangId: IsNull() } });
  for (const plate of plates) {
    let result = await parkingApiClient.addCar({
      carNum: plate.carNum,
      carOwner: plate.ownerName,
      phone: plate.ownerPhone,
      licensePlateColor: plate.licensePlateColor,
      beginTime: format(plate.beginTime, "yyyy-MM-dd"),
      endTime: format(plate.endTime, "yyyy-MM-dd"),
      userId: plate.ownerId,
      area: "chengjiang",
    });
    if (result["success"]) {
      plate.chengJiangId = result?.["result"]?.["id"];
    } else {
      logger.error(result);
    }
    await plate.save();
  }
};
