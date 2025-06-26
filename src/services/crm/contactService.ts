import { DataSource, getRepository, IsNull, Repository } from "typeorm";
import _ from "lodash";
import { ExternalContact, FollowUser } from "../../entity/crm/externalContact";
import { PgDataSource } from "../../config/data-source";
import { jctimesApiClient } from "../../api/jctimes/app";
import { Contact } from "../../entity/crm/contact";
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { JdyUtil } from "../../utils/jdyUtils";
import { Customer } from "../../entity/crm/customer";
import { jctimesContractApiClient } from "../../api/jctimes/contract";

const ADD_WAY_MAP = {
  0: "未知来源",
  1: "扫描二维码",
  2: "搜索手机号",
  3: "名片分享",
  4: "群聊",
  5: "手机通讯录",
  6: "微信联系人",
  8: "安装第三方应用时自动添加的客服人员",
  9: "搜索邮箱",
  10: "视频号添加",
  11: "通过日程参与人添加",
  12: "通过会议参与人添加",
  13: "添加微信好友对应的企业微信",
  14: "通过智慧硬件专属客服添加",
  15: "通过上门服务客服添加",
  16: "通过获客链接添加",
  17: "通过定制开发添加",
  18: "通过需求回复添加",
  21: "通过第三方售前客服添加",
  22: "通过可能的商务伙伴添加",
  24: "通过接受微信账号收到的好友申请添加",
  201: "内部成员共享",
  202: "管理员/负责人分配",
};

class ContactService {
  appid = "6191e49fc6c18500070f60ca";
  entryid = "020100300000000000000001";
  private externalContactRepo: Repository<ExternalContact>;

  constructor() {
    this.externalContactRepo = PgDataSource.getRepository(ExternalContact);
  }

  findJdy = async () => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      {
        limit: 100,
      }
    );
    return result;
  };

  mapping = (item: any) => {
    return Contact.create({
      name: item["name"],
      jdyId: item["_id"],
      phone: item["phone"],
      companyName: item["account_id"]?.["name"],
      companyId: item["_widget_1739172665548"],
      position: item["_widget_1631072817206"],
      gender: { 男: 1, 女: 2 }?.[item["_widget_1631072817161"]] ?? 0,
      address: JdyUtil.getAddress(item["_widget_1740707211472"])?.full,
      isKeyDecisionMaker:
        { 是: true, 否: false }?.[item["_widget_1631072817282"]] ?? false,
      remark: item["_widget_1631072817316"],
      creatorId: JdyUtil.getUser(
        item["_widget_1739167799593"] ?? item["charger"]
      )?.username,
    });
  };

  addAlltoDb = async () => {
    const data = await this.findJdy();
    const c: any[] = [];
    for (const item of data) {
      const cus = this.mapping(item);
      c.push(cus);
    }
    const chunks = _.chunk(c, 1000);
    for (const chunk of chunks) {
      await Contact.upsert(chunk, {
        conflictPaths: ["jdyId"],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  };

  trigger = async (appid, entryid, op, data) => {
    if (appid != this.appid || entryid != this.entryid) return;
    const contact = this.mapping(data);
    await Contact.upsert(contact, {
      conflictPaths: ["jdyId"],
      skipUpdateIfNoValuesChanged: true,
    });
  };

  addtoJdy = async (contact: Contact) => {
    const data = await jdyFormDataApiClient.singleDataCreate({
      app_id: this.appid,
      entry_id: this.entryid,
      data: {
        name: JdyUtil.setText(contact.name),
        phone: JdyUtil.setText(contact.phone),
        _widget_1747331864348: JdyUtil.setText(contact.companyName),
        _widget_1739172665548: JdyUtil.setText(contact.companyId),
        _widget_1631072817206: JdyUtil.setText(contact.position),
        _widget_1631072817161: JdyUtil.setText(
          { 1: "男", 2: "女" }?.[contact.gender] ?? ""
        ),
        _widget_1631072817282: JdyUtil.setText(
          contact.isKeyDecisionMaker ? "是" : "否"
        ),
        _widget_1740707211472: JdyUtil.setAddress({ detail: contact.address }),
        _widget_1739167799593: JdyUtil.setText(contact.creatorId),
        charger: JdyUtil.setText(contact.creatorId),
      },
      options: {
        data_creator: contact.creatorId,
      },
    });
    if (data?._id) {
      contact.jdyId = data._id;
      await contact.save();
    }
  };

  getContactbyCompany = async (companyId: string) => {
    try {
      const rows: any[] =
        (await jctimesContractApiClient.getCustomerContacts(companyId)) ?? [];
      const contacts = rows.map((item) => {
        return {
          customerName: String(item["客户名称"] ?? "").trim(),
          customerId: String(item["客户ID"] ?? "").trim(),
          address: String(item["地址"] ?? "").trim(),
          contact: String(item["联系人"] ?? "").trim(),
          phone: String(item["电话"] ?? "").trim(),
          fax: String(item["传真"] ?? "").trim(),
        };
      });
      const fax = Array.from(new Set(contacts.map((c) => c.fax).filter(Boolean)));
      const address = Array.from(
        new Set(contacts.map((c) => c.address).filter(Boolean))
      );
      return { contact: contacts, general: { fax, address } };
    } catch (error) {
      return { contact: [], general: { fax: [], address: [] } };
    }
  };

  addContact = async (data) => {
    const contact = await Contact.save(Contact.create(data));
    if (contact) {
      this.addtoJdy(contact);
    }
  };

  async getJdyIdByExternalUserId(externalUserId: string) {
    if (!externalUserId) return;
    const contact = await this.externalContactRepo.findOne({
      where: {
        external_userid: externalUserId,
      },
    });
    return contact?.companyJdyId;
  }
  async getExternalUserInfofromDb(externalUserId: string, userid: string) {
    if (!externalUserId) return;
    const info = await this.externalContactRepo.findOne({
      where: {
        external_userid: externalUserId,
      },
    });
    const followUser = await FollowUser.findOne({
      where: {
        external_userid: externalUserId,
        userid,
      },
    });
    return { info, followUser };
  }
  async getExternalUserInfo(externalUserId: string, userid: string) {
    if (!externalUserId) return;
    let data = await this.getExternalUserInfofromDb(externalUserId, userid);
    if (!data?.info || !data?.followUser) {
      const detail = await jctimesApiClient.getExternalContactDetail(
        externalUserId,
        ""
      );
      await this.bulkImportContacts([detail]);
      data = await this.getExternalUserInfofromDb(externalUserId, userid);
    }
    if (!data) return;
    const { info, followUser } = data;
    const result = { ...info };
    if (info?.type === 1) {
      result.corp_name = followUser?.remark_corp_name || "";
      result.name = followUser?.remark || "";
      result["phone"] = followUser?.remark_mobiles || "";
    }
    return result;
  }
  async matchCompanyContacts({
    externalUserId,
    corpName,
    jdyId,
    userid,
    name,
    position,
    remark,
    mobile,
    isKeyDecisionMaker,
    updateQywxRemark,
  }) {
    if (!externalUserId) return;
    await this.externalContactRepo.update(
      { external_userid: externalUserId },
      {
        companyJdyId: jdyId,
        companyName: corpName,
        name,
        position,
        remark,
        mobile,
        is_key_decision_maker: isKeyDecisionMaker,
      }
    );
    if (updateQywxRemark && userid) {
      await jctimesApiClient.updateRemark({
        userid,
        external_userid: externalUserId,
        remark_company: corpName,
        remark: name,
        description: position,
      });
    }
  }

  async bulkImportContactsData() {
    const users = await jctimesApiClient.getUserLists();
    // const users = [{ userid: "LiangZhi" }];
    const userChunk = _.chunk(users, 5);
    const insert = async (user) => {
      const data = await jctimesApiClient.getExternalContactDetailBatch(
        user.map((u) => u.userid)
      );
      const result = await this.bulkImportContacts(
        data["external_contact_list"]
      );
    };
    for (const user of userChunk) {
      const data = await jctimesApiClient.getExternalContactDetailBatch(
        user.map((u) => u.userid)
      );
      const result = await this.bulkImportContacts(
        data["external_contact_list"]
      );
      return result;
    }
  }

  /**
   * 批量导入联系人数据（高性能版）
   * @param contactsData 原始数据数组
   * @param batchSize 每批次处理量（默认200）
   */
  bulkImportContacts = async (
    contactsData: any[],
    batchSize = 200
  ): Promise<void> => {
    if (!contactsData?.length) return;

    // 使用 lodash 分批次处理（避免单次事务过大）
    const batches = _.chunk(contactsData, batchSize);

    for (const batch of batches) {
      await this.externalContactRepo.manager.transaction(async (manager) => {
        const contactRepo = manager.getRepository(ExternalContact);

        // 准备所有 ExternalContact 和关联的 FollowUser
        const externalContacts = batch.map((data) => {
          const contact = this.prepareExternalContact(data.external_contact);
          if (data.follow_user) {
            contact.follow_users =
              data.follow_user?.map((fu) =>
                this.prepareFollowUser(contact.external_userid, fu)
              ) || [];
          }
          if (data.follow_info) {
            contact.follow_users = [
              this.prepareFollowUser(contact.external_userid, data.follow_info),
            ];
          }
          return contact;
        });

        // 批量保存（自动级联）
        const result = await contactRepo.save(groupBy(externalContacts));
        // await FollowUser.delete({ external_userid: IsNull() });
        return result;
      });
    }
  };

  /**
   * 准备 ExternalContact 实体（复用之前的方法）
   */
  private prepareExternalContact(contactData: any): ExternalContact {
    const contact = new ExternalContact();
    contact.external_userid = contactData.external_userid;
    contact.name = contactData.name;
    contact.position = contactData.position;
    contact.avatar = contactData.avatar;
    contact.corp_name = contactData.corp_name;
    contact.corp_full_name = contactData.corp_full_name;
    contact.type = contactData.type;
    contact.gender = contactData.gender;
    contact.unionid = contactData.unionid;
    contact.external_profile = contactData.external_profile;
    return contact;
  }

  /**
   * 准备 FollowUser 实体（复用之前的方法 + lodash 简化）
   */
  private prepareFollowUser(externalUserId: string, fuData: any): FollowUser {
    return _.assign(new FollowUser(), {
      external_userid: externalUserId,
      userid: fuData.userid,
      remark: fuData.remark,
      description: fuData.description,
      createtime: new Date(fuData.createtime * 1000),
      tags: fuData.tags,
      remark_corp_name: fuData.remark_corp_name,
      remark_mobiles: fuData.remark_mobiles,
      oper_userid: fuData.oper_userid,
      add_way: ADD_WAY_MAP[fuData.add_way] || "未知来源",
      wechat_channels: fuData.wechat_channels,
    });
  }
}

export const contactService = new ContactService();

const groupBy = (data) => {
  // 1. 先按 external_userid 分组
  const grouped = _.groupBy(data, "external_userid");

  // 2. 对每组进行处理，合并 follow_users
  const result = _.map(grouped, (group) => {
    // 合并组内所有对象的 follow_users 数组
    const mergedFollowUsers = _.flatMap(group, "follow_users");

    // 取组内第一个对象作为基础，替换其 follow_users
    return _.mergeWith({}, group[0], {
      follow_users: _.uniq(mergedFollowUsers), // 如果需要去重就加上 _.uniq
    });
  });
  return result;
};
