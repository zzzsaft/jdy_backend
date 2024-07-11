import { apiClient } from "./api_client";

interface ICreateCarInfo {
  carNum: string;
  carOwner: string;
  phone: string;
  licensePlateColor: string;
  beginTime: string;
  endTime: string;
  userId: string;
}
interface IUpdateCarInfo {
  id: string;
  carNum?: string;
  carOwner?: string;
  phone?: string;
  beginTime: string;
  endTime: string;
  userId: string;
}

interface IGetCarInfo {
  id?: string;
  carNum?: string;
  carOwner?: string;
  phone?: string;
  beginTimeRangeStart?: string;
  beginTimeRangeEnd?: string;
  endTimeRangeStart?: string;
  endTimeRangeEnd?: string;
  userId?: string;
}

class ParkingApiClient {
  async addCar(carInfo: ICreateCarInfo) {
    return await apiClient.doRequest({
      method: "POST",
      path: "/jeecg-boot/openApi/addCarInfo",
      payload: carInfo,
    });
  }
  async updateCar(carInfo: IUpdateCarInfo) {
    return await apiClient.doRequest({
      method: "POST",
      path: "/jeecg-boot/openApi/updateById",
      payload: carInfo,
    });
  }
  async deleteCar(id: string) {
    return await apiClient.doRequest({
      method: "DELETE",
      path: "/jeecg-boot/openApi/deleteById",
      query: { id: id },
    });
  }

  async getCar(carInfo: IGetCarInfo) {
    return await apiClient.doRequest({
      method: "POST",
      path: "/jeecg-boot/openApi/list",
      payload: { ...carInfo, pageSize: "1000" },
    });
  }

  async getCarById(id: string) {
    return await apiClient.doRequest({
      method: "GET",
      path: "/jeecg-boot/openApi/queryById",
      query: { id: id },
    });
  }
}
export const parkingApiClient = new ParkingApiClient();
