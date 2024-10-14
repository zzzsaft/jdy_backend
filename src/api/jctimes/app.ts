import { IAppoint } from "../../type/IType";
import { ApiClient } from "./api_client";

class JCtimesApiClient extends ApiClient {
  async getUserLists(): Promise<{ userid: string; department: number }[]> {
    return (
      await this.doRequest({
        method: "GET",
        path: "/getAllUsers",
      })
    )["dept_user"];
  }
}
export const jctimesApiClient = new JCtimesApiClient();
