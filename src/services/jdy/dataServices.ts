import { formApiClient } from "../../api/jdy/form";
import { JdyWidget } from "../../entity/util/jdy_form_widget";

class DataService {
  constructor(private appId: string, private entryId: string) {}

  static async dataCreate(appId: string, entryId: string) {
    const widgets = await formApiClient.formWidgets(appId, entryId);
  }

  static async dataUpdate(appId: string, entryId: string) {}

  static async dataDelete(appId: string, entryId: string) {}

  static async dataRecover(appId: string, entryId: string) {}
}
