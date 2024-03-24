import { formDataApiClient } from "../utils/jdy/form_data";
export const getUserList = async () => {
    const { appid, entryid } = formDataApiClient.getFormId("员工档案");
    const option = {
        limit: 100,
        filter: {
            rel: "and",
            cond: [
                {
                    field: "_widget_1701399332764",
                    method: "ne",
                    value: ["离职"],
                },
                {
                    field: "_widget_1705252329045",
                    method: "ne",
                    value: ["不参与考勤"],
                },
            ],
        },
        fields: ["_widget_1690274843463", "full_name"],
    };
    return await formDataApiClient.batchDataQuery(appid, entryid, option);
};
//# sourceMappingURL=checkinCalculator.js.map