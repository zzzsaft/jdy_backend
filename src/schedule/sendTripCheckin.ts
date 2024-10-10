import { xftOAApiClient } from "../utils/xft/xft_oa";
import { LogTripSync } from "../entity/common/log_trip_sync";
import { log } from "console";

type busData = {
  value: {
    fbtRootId: string;
    tripUser: { NAME: string; CODE: string };
    date: string;
    reason: string;
    name: string;
  };
};

export class SendTripCheckin {
  // async

  async createTripCheckin(logTripSync: LogTripSync) {}

  async generateBusData(logTripSync: LogTripSync): Promise<busData> {
    return {
      value: {
        name: "qq",
        fbtRootId: logTripSync.fbtRootId,
        tripUser: {
          NAME: "",
          CODE: logTripSync.userId,
        },
        date: "",
        reason: "",
      },
    };
  }
  async startTrial(startId: string, busData: any) {
    const res = await xftOAApiClient.trial({ starterId: "U0000", busData });
    if (res["returnCode"] == "SUC0000" && res["body"]["trialId"]) {
      await xftOAApiClient.start({
        starterId: startId,
        trialId: res["body"]["trialId"],
      });
    }
  }
}
