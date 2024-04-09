import { ApiClient } from "./api_client";
import { token_checkin } from "./token";
class CheckinApiClient extends ApiClient {
    async getHardwareCheckinData(options) {
        return await this.doRequest({
            method: "POST",
            path: "/cgi-bin/hardware/get_hardware_checkin_data",
            payload: {
                ...options,
            },
            query: {
                access_token: await token_checkin.get_token(),
            },
        }, {
            name: "get_hardware_checkin_data",
            duration: 1000,
            limit: 30,
        });
    }
    async getCheckinData(options) {
        return await this.doRequest({
            method: "POST",
            path: "/cgi-bin/checkin/getcheckindata",
            payload: {
                opencheckindatatype: 3,
                ...options,
            },
            query: {
                access_token: await token_checkin.get_token(),
            },
        }, {
            name: "getcheckindata",
            duration: 1000,
            limit: 600,
        });
    }
}
export const checkinApiClient = new CheckinApiClient();
//# sourceMappingURL=chekin.js.map