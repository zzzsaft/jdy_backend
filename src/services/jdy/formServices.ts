import { formApiClient } from "../../api/jdy/form";
import { JdyWidget } from "../../entity/util/jdy_form_widget";

export class FormServices {}

export const insertWidgets = async (appId: string, entryId: string) => {
  const widgets = await formApiClient.formWidgets(appId, entryId);
  await JdyWidget.insertWidgets(appId, entryId, widgets["widgets"]);
};
