import { formDataApiClient } from "../utils/jdy/form_data";

const getUserList = async () => {
  const { appid, entryid } = formDataApiClient.getFormId("员工档案");
  const option = {
    limit: 100,
    filter: {},
  };
  await formDataApiClient.batchDataQuery(appid, entryid, {
    limit: 100,
    filter: {
      rel: "and",
      cond: [
        {
          field: "",
          method: "ne",
          value: ["离职"],
        },
      ],
    },
  });
};
