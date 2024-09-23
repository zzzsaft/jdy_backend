import { formDataApiClient } from "../utils/jdy/form_data";
import { xftatdApiClient } from "../utils/xft/xft_atd";

// formDataApiClient.batchDataQuery()
await xftatdApiClient.addOvertime({
  staffName: "杨萍丽",
  staffNumber: "YangPingLi",
  overtimeDate: "2024-09-02",
  beginTime: "17:20",
  beginTimeType: "当日",
  endTime: "18:50",
  endTimeType: "",
  overtimeReason: "当日",
});
