import { Between, IsNull, Not } from "typeorm";
import { LogLocation } from "../features/log/entity/log_location";
import { addMinutes, differenceInMinutes } from "date-fns";
import { gaoDeApiClient } from "../api/gaode/app";
import _ from "lodash";

class LocationService {
  existLocation: { [userid: string]: Date } = {};
  addLocation = async (
    userid: string,
    time: Date,
    latitude: number,
    longitude: number,
    source = ""
  ) => {
    if (userid in this.existLocation) {
      if (differenceInMinutes(time, this.existLocation[userid]) < 5) {
        return;
      }
      this.existLocation[userid] = time;
    } else {
      this.existLocation[userid] = time;
    }
    const exists = await LogLocation.findOne({
      where: {
        userid,
        time: Between(
          addMinutes(new Date(time), -5),
          addMinutes(new Date(time), 5)
        ),
      },
    });
    if (exists) return;
    const location = LogLocation.create({
      userid,
      time,
      longitude,
      latitude,
      source,
    });
    await location.save();
    const exist = await this.checkLocation(location);
    if (exist) return;
    await this.getLocations(location);
  };
  checkLocation = async (location: LogLocation) => {
    const tolerance = 0.001;
    const lat = parseFloat(location.latitude.toString());
    const lon = parseFloat(location.longitude.toString());
    const exist = await LogLocation.findOne({
      where: {
        latitude: Between(lat - tolerance, lat + tolerance),
        longitude: Between(lon - tolerance, lon + tolerance),
        address: Not(IsNull()),
      },
    });
    if (exist) {
      location.address = exist.address;
      location.country = exist.country;
      location.province = exist.province;
      location.city = exist.city;
      location.citycode = exist.citycode;
      location.district = exist.district;
      location.adcode = exist.adcode;
      location.township = exist.township;
      location.towncode = exist.towncode;
      location.neighborhood = exist.neighborhood;
      location.building = exist.building;
      location.streetNumber = exist.streetNumber;
      await location.save();
      return true;
    }
    return false;
  };
  getLocations = async (location: LogLocation) => {
    const geo = await gaoDeApiClient.reGeo(
      location.longitude,
      location.latitude
    );
    if (!geo.regeocode) {
      return;
    }
    location.address = geo.regeocode.formatted_address;
    location.country = geo.regeocode.addressComponent.country;
    location.province = geo.regeocode.addressComponent.province;
    location.city = geo.regeocode.addressComponent.city;
    location.citycode = geo.regeocode.addressComponent.citycode;
    location.district = geo.regeocode.addressComponent.district;
    location.adcode = geo.regeocode.addressComponent.adcode;
    location.township = geo.regeocode.addressComponent.township;
    location.towncode = geo.regeocode.addressComponent.towncode;
    location.neighborhood = geo.regeocode.addressComponent.neighborhood;
    location.building = geo.regeocode.addressComponent.building;
    location.streetNumber = geo.regeocode.addressComponent.streetNumber;
    return location.save();
  };
}
export const locationService = new LocationService();

export const testLocation = async () => {
  const locations = await LogLocation.find({
    where: {
      time: Between(new Date("2024-11-01"), new Date("2024-11-09")),
      address: IsNull(),
    },
  });
  if (!locations) return;
  for (const location of locations) {
    const exist = await locationService.checkLocation(location);
    if (exist) continue;
    await locationService.getLocations(location);
  }
};
export const testLocation1 = async () => {
  const locations = await LogLocation.find({
    where: {
      longitude: Between(121.199, 121.199),
      latitude: Between(28.628, 28.628),
    },
  });
  const lo = locations.find((location) => location.address != null);
  if (!lo) return;
  const re: any[] = [];
  for (const location of locations) {
    if (!location.address) {
      location.address = lo.address;
      location.country = lo.country;
      location.province = lo.province;
      location.city = lo.city;
      location.citycode = lo.citycode;
      location.district = lo.district;
      location.adcode = lo.adcode;
      location.township = lo.township;
      location.towncode = lo.towncode;
      location.neighborhood = lo.neighborhood;
      location.building = lo.building;
      location.streetNumber = lo.streetNumber;
      re.push(location);
    }
  }
  const chunk = _.chunk(re, 100);
  for (const c of chunk) {
    await LogLocation.save(c);
  }
};
