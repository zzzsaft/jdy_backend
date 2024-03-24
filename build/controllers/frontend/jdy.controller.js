import appApiClient from "../../utils/jdy/app";
import formApiClient from "../../utils/jdy/form";
export const getAppList = async (request, response) => {
    response.send(await appApiClient.appList());
};
export const getEntryList = async (request, response) => {
    response.send(await appApiClient.entryList(request.params.app_id));
};
export const getFormWidgets = async (request, response) => {
    response.send(await formApiClient.formWidgets(request.query.app_id, request.query.entry_id));
};
//# sourceMappingURL=jdy.controller.js.map