import { Approval } from "../../entity/atd/wx_approval";
import { approvalApiClient } from "../../api/wechat/approval";
import { ApplyData } from "../../type/wechat/IApproval";
import { xftOrgnizationApiClient } from "../../api/xft/xft_orgnization";
import { contactApiClient } from "../../api/wechat/contact";
import { logger } from "../../config/logger";
import { User } from "../../entity/basic/employee";
import { Department } from "../../entity/basic/department";

export const handleContactEvent = async (msg: any) => {
  const UserID = msg?.["UserID"]?.["value"];
  let data;
  switch (msg["ChangeType"]["value"]) {
    case "create_user":
      await createUser(UserID);
      break;
    case "update_user":
      break;
    case "delete_user":
      User.update({ user_id: UserID }, { is_employed: false });
      break;
    case "create_party":
      data = await contactApiClient.getDepartmentInfo(msg["Id"]["value"]);
      await Department.create({
        department_id: msg["Id"]["value"],
        name: data?.["department"]?.["name"] ?? "error",
        parent_id: msg["ParentId"]["value"],
        is_exist: true,
      }).save();
      break;
    case "update_party":
      data = await contactApiClient.getDepartmentInfo(msg["Id"]["value"]);
      await Department.update(
        { department_id: msg["Id"]["value"] },
        {
          name: data?.["department"]?.["name"] ?? "error",
          parent_id: msg["ParentId"]["value"],
        }
      );
      // let org = await xftOrgnizationApiClient.getOrgnization(
      //   msg["Id"]["value"]
      // );
      // let orgid = org["OPORGQRYZ"][0]["ORGSEQ"];
      // if (!orgid) logger.error(`orgid not found${org}`);
      // await xftOrgnizationApiClient.updateOrgnization({
      //   id: msg["Id"]["value"],
      //   name: data["department"]["name"] ?? "error",
      //   parent_id: msg["ParentId"]["value"],
      // });
      break;
    case "delete_party":
      await Department.update(
        { department_id: msg["Id"]["value"] },
        { is_exist: false }
      );
      break;
    default:
      break;
  }
};

export const createUser = async (UserID) => {
  const info = await contactApiClient.getUser(UserID);
  const name = info["name"];
  const mobile = info["mobile"];
  const department = info["department"];
  const main_department = info["main_department"];
  await User.create({
    user_id: UserID,
    name,
    mobile,
    department_id: department,
    is_employed: true,
    main_department_id: main_department,
  }).save();
};
