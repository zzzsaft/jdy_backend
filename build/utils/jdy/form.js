import { ApiClient } from "./api_client";
const FORM_BASE_PATH = "app/entry/";
class FormApiClient extends ApiClient {
    validVersions = ["v5"];
    defaultVersion = "v5";
    /**
     * check version
     */
    async doRequest(options, limitOption) {
        if (!this.validVersions.includes(this.version)) {
            this.version = this.defaultVersion;
        }
        return super.doRequest(options, limitOption);
    }
    /**
     * 表单字段查询接口
     */
    async formWidgets(app_id, entry_id) {
        return await this.doRequest({
            method: "POST",
            path: FORM_BASE_PATH + "widget/list",
            payload: {
                app_id,
                entry_id,
            },
        }, {
            name: "formWidgets",
            duration: 1000,
            limit: 30,
        });
    }
}
export default new FormApiClient("v5");
//# sourceMappingURL=form.js.map