import { User } from "../../../entity/basic/employee";
import { jdyFormDataApiClient } from "../../jdy/api/form_data";
import { downloadFileStream } from "../../../utils/fileUtils";
import { dahuaServices } from "./dahuaServices";

const getJdyInfo = async () => {
  const id = jdyFormDataApiClient.getFormId("员工档案");
  return await jdyFormDataApiClient.batchDataQuery(id.appid, id.entryid, {
    fields: ["_widget_1704997861762", "full_name", "_widget_1691239227137"],
    filter: {
      rel: "and",
      cond: [
        { field: "_widget_1701399332764", method: "ne", value: ["离职"] },
        { field: "_widget_1704997861762", method: "not_empty" },
      ],
    },
    limit: 100,
  });
};

export const saveExistInfo = async () => {
  const jdyInfos = await getJdyInfo();
  for (const jdyInfo of jdyInfos) {
    const userId = jdyInfo["_widget_1691239227137"];
    if (!(await User.findOneBy({ user_id: userId }))?.dahua_id) continue;
    const photo = jdyInfo["_widget_1704997861762"];
    const url = photo[0]["url"];
    const fileName = photo[0]["name"];
    const fileStream = await downloadFileStream(url);
    await dahuaServices.addtoDahua({
      userId,
      name: jdyInfo["full_name"],
      fileStream,
      fileName,
    });
  }
};

export const updateExistInfo = async (data) => {
  const userId = data["_widget_1691239227137"];
  if (!!(await User.findOneBy({ user_id: userId }))?.dahua_id) return;
  const photo: any[] = data["_widget_1704997861762"];
  if (photo.length == 0) return;
  const url = photo[0]["url"];
  const fileName = photo[0]["name"];
  const fileStream = await downloadFileStream(url);
  await dahuaServices.addtoDahua({
    userId,
    name: data["full_name"],
    fileStream,
    fileName,
  });
};

export const saveNewInfotoDahua = async (data) => {
  let userId = data["_widget_1720801227437"];
  if (!(await User.findOneBy({ user_id: userId }))?.dahua_id) return;
  const photo = data["_widget_1704998079070"];
  const url = photo[0]["url"];
  const fileName = photo[0]["name"];
  const fileStream = await downloadFileStream(url);
  await dahuaServices.addtoDahua({
    userId,
    name: data["full_name"],
    fileStream,
    fileName,
  });
};
