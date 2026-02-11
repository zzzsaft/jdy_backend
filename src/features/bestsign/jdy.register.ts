import { registerJdy } from "../../controllers/jdy/jdy.registry";
import { bestSignTemplateTextLabelService } from "./service/bestSignTemplateTextLabelService";

const APP_ID = "5cd65fc5272c106bbc2bbc38";
const ENTRY_ID = "69871a0b0eccd9e21de72486";

const syncTextLabels = async (data: any) => {
  await bestSignTemplateTextLabelService.syncFromJdy(data);
};

registerJdy(APP_ID, ENTRY_ID, "data_create", syncTextLabels);
registerJdy(APP_ID, ENTRY_ID, "data_update", syncTextLabels);
registerJdy(APP_ID, ENTRY_ID, "data_remove", async (data: any) => {
  await bestSignTemplateTextLabelService.removeByJdyPayload(data);
});
