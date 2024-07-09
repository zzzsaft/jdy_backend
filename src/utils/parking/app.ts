import { apiClient } from "./api_client";

interface ICreateCarInfo {
  carNum: string;
  carOwner: string;
  phone: string;
  beginTime: string;
  endTime: string;
}
interface IUpdateCarInfo {
  id: string;
  carNum?: string;
  carOwner?: string;
  phone?: string;
  beginTime: string;
  endTime: string;
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
}

class ParkingApiClient {
  async addCar(carInfo) {
    return await apiClient.doRequest({
      method: "POST",
      path: "/jeecg-boot/openApi/addCarInfo",
      payload: carInfo,
    });
  }
  async updateCar(carInfo: IUpdateCarInfo) {
    return await apiClient.doRequest({
      method: "POST",
      path: "/hrm/hrm2/xft-employeeprofile/employee/staff-general-api/modify-staff",
      payload: carInfo,
    });
  }
  async deleteCar(id: string) {
    return await apiClient.doRequest({
      method: "GET",
      path: "/jeecg-boot/openApi/deleteCar",
      query: { id: id },
    });
  }

  async getCar(carInfo: IGetCarInfo) {
    return await apiClient.doRequest({
      method: "GET",
      path: "/jeecg-boot/openApi/queryById",
      payload: carInfo,
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
