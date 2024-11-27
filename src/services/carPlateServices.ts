import { IsNull } from "typeorm";
import { parkingApiClient } from "../api/parking/app";
import { logger } from "../config/logger";
import { ParkingInfo } from "../entity/parking/dh_car_info";
import { format } from "date-fns";

class CarPlateServices {
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
}

export const carPlateServices = new CarPlateServices();

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
