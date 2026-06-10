import { vehicleService } from "../../services/vehicleService.js";

export const addCar = async (data) => {
  return await vehicleService.addCar(data);
};

export const updateCar = async (data) => {
  return await vehicleService.updateCar(data);
};

export const deleteCar = async (data) => {
  return await vehicleService.deleteCar(data);
};

export const punishCar = async (data) => {
  return await vehicleService.punishCar(data);
};
