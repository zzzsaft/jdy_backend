import { sleep } from "../../config/limiter";
import { User } from "../../entity/basic/employee";
import { appApiClient, connectApiClient } from "./api_client";

class XFTGeneralApiClient {
  async uploadFile(file) {
    let formData = new FormData();
    formData.append("file", file);
    return await appApiClient.doRequest({
      method: "POST",
      path: "/common/api/common/xft-file/resource/uploadFile",
      payload: { formData },
    });
  }
  async getAllUserTodoList() {
    let list: any[] = [];
    const user_ids = await User.find({
      where: { is_employed: true },
      select: ["xft_enterprise_id"],
    });
    for (const id of user_ids) {
      const todos = (await this.getTodoList(id.xft_enterprise_id))["body"][
        "records"
      ];
      await sleep(500);
      list = list.concat(todos);
    }
  }
  async getTodoList(
    userid: string,
    currentPage = 0,
    dealStatus: "todo" | "done" | "cancelled" = "todo"
  ) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/xftmsg/msg/xft-message/v1/todo-task/page/by-user",
        payload: {
          currentPage,
          dealStatus,
          pageSize: 1000,
        },
      },
      userid
    );
  }
  async getMsg(userid: string, currentPage = 0) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/xftmsg/msg/xft-message/v1/message/page/by-user",
        payload: {
          currentPage,
          pageSize: 1000,
        },
      },
      userid
    );
  }
}
export const xftGeneralApiClient = new XFTGeneralApiClient();
