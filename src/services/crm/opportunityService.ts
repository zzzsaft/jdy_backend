import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { tycApiClient } from "../../api/tianyacha/app";
import { Log } from "../../entity/log/log";
import { CustomerInfo } from "../../entity/crm/customerInfo";
import { JdyUtil } from "../../utils/jdyUtils";
import { Customer } from "../../entity/crm/customer";
import { Any, Brackets, In, Like } from "typeorm";
import { Opportunity, OpportunityQuote } from "../../entity/crm/opportunity";
import { removeUndefined } from "../../utils/stringUtils";
import { customerServices } from "./customerService";
import { MessageService } from "../messageService";

class OpportunityServices {
  appid = "6191e49fc6c18500070f60ca";
  entryid = "020100500000000000000001";

  private isExist = async (name: string) => {
    return await CustomerInfo.exists({ where: { name } });
  };

  trigger = async (appid, entryid, op, data) => {
    if (appid !== this.appid || entryid !== this.entryid) return;
    if (op == "data_create") {
      await this.setSupport(data);
    }
    this.saveToDb(data);
  };

  mapping = (data) => {
    return Opportunity.create({
      id: data._id,
      name: data.opportunity_name,
      opportunityCode: data.opportunity_no,
      status: data.sale_stage?.["name"],
      accountId: data._widget_1631064792937,
      accountName: data._widget_1743575845666,
      chargerId: JdyUtil.getUser(data.charger)?.username,
      chargerName: JdyUtil.getUser(data.charger)?.name,
      applicableMaterials: data._widget_1743037894668,
      downstreamProducts: data._widget_1743037894673,
      createdAt: new Date(data.createTime),
      details: data._widget_1631002659171?.map((item) => ({
        id: item._id,
        productCategory: [
          item._widget_1743037894686,
          item._widget_1743037894688,
          item._widget_1743056389941,
        ].filter((v) => v),
        productName: item._widget_1631002659271,
        price: item._widget_1631002659274,
        quantity: item._widget_1631002659711,
        subtotal: item._widget_1631002659777,
      })),
    });
  };

  findJdy = async () => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      { limit: 100 }
    );
    return result;
  };

  addAlltoDb = async () => {
    const data = await this.findJdy();
    const c: Opportunity[] = [];
    for (const item of data) {
      const cus = this.mapping(item);
      c.push(cus);
    }
    await Opportunity.save(c);
  };

  saveToDb = async (data: any) => {
    const cus = this.mapping(data);
    await Opportunity.save(cus);
    const account_charger = JdyUtil.getUser(
      data["_widget_1747303141237"]
    )?.name;
    const chargerid = JdyUtil.getUser(data["charger"])?.username;
    const chargerName = JdyUtil.getUser(data["charger"])?.name;
    if (!account_charger && chargerid) {
      await customerServices.setCharger(cus.accountName, {
        userid: chargerid,
        username: chargerName,
      });
      await new MessageService([chargerid], "jdy").send_plain_text(
        `${cus.accountName}的客户负责人因首个填写该客户的商机已修改为${chargerName}`
      );
    }
  };

  setSupport = async (data) => {
    const support = JdyUtil.getUser(data["_widget_1749235567298"])?.username;
    const supportCandidate = JdyUtil.getUser(data["_widget_1749236004300"]);
    const name = data._widget_1743575845666;
    const determine = data._widget_1749240821558;
    if ((!support || determine == "0") && supportCandidate) {
      await customerServices.setSupport(name, {
        userid: supportCandidate.username,
        name: supportCandidate.name,
      });
    }
  };

  getOpportunity = async (
    userid: string,
    companyNames: string[] = [],
    status?: string[]
  ) => {
    const query = Opportunity.createQueryBuilder("opportunity")
      .leftJoinAndMapOne(
        "opportunity.customer",
        Customer,
        "customer",
        "customer.name = opportunity.accountName"
      )
      .leftJoinAndMapMany(
        "opportunity.products",
        "opportunity.details",
        "products"
      )
      .leftJoin("opportunity.quotes", "quote")
      .where(
        new Brackets((qb) => {
          qb.where("customer.chargerId = :userid", { userid })
            .orWhere("opportunity.chargerId = :userid", { userid })
            .orWhere("customer.collaborator LIKE :search", {
              search: `%${userid}%`,
            });
        })
      )
      .andWhere(
        companyNames.length > 0 ? "customer.name IN (:...companyNames)" : "1=1",
        { companyNames }
      )
      .loadRelationCountAndMap("opportunity.quotesCount", "opportunity.quotes")
      .select([
        "opportunity.id",
        "opportunity.name",
        // "opportunity.status",
        "opportunity.chargerId",
        "opportunity.chargerName",
        "customer.id",
        "customer.name",
        "customer.charger",
        "customer.collaborator",
        "opportunity.createdAt",
        "opportunity.latestQuoteStatus",
        "opportunity.latestQuoteDate",
        "products.productCategory",
        "products.productName",
      ]);
    let opportunities = await query.getMany();
    opportunities = removeUndefined(opportunities);
    if (status?.includes("未报价")) {
      return opportunities.filter(
        (op) =>
          op?.["quotesCount"] === 0 ||
          status.includes(op?.["latestQuoteStatus"])
      );
    } else if (status) {
      return opportunities.filter(
        (op) =>
          op?.["quotesCount"] > 0 &&
          status.includes(op?.["latest_quote_status"])
      );
    }
    return opportunities;
  };
}
export const opportunityServices = new OpportunityServices();
