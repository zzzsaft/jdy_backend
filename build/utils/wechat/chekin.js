import { ApiClient } from "./api_client";
import { token_checkin } from "./token";
class CheckinApiClient extends ApiClient {
    async get_hardware_checkin_data(options) {
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
}
export const checkinApiClient = new CheckinApiClient();
//# sourceMappingURL=chekin.js.map