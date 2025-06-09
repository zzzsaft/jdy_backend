import { LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { BusinessTrip } from "../entity/atd/businessTrip";

class BusinessTripService {
  findBusinessTrip = async (userId, checkinDate) => {
    const exist = await BusinessTrip.findOne({
      where: {
        userId,
        start_time: LessThanOrEqual(checkinDate),
        end_time: MoreThanOrEqual(checkinDate),
      },
    });
    return exist?.fbtRootId ?? exist?.xftFormId;
  };
}

export const businessTripService = new BusinessTripService();
