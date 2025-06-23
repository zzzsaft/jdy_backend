import _ from "lodash";
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { workflowApiClient } from "../../api/jdy/workflow";
import { XftTripCheckin } from "../../entity/atd/business_trip_checkin";
import { Quote, QuoteItem } from "../../entity/crm/quote";
import { WechatMessage } from "../../entity/log/log_message";
import { JdyUtil } from "../../utils/jdyUtils";
import { businessTripCheckinServices } from "../jdy/businessTripCheckinServices";
import { MessageService } from "../messageService";
import { checkinServices } from "../xft/checkinServices";
import {
  getManager,
  In,
  IsNull,
  Not,
  Brackets,
  LessThan,
  MoreThan,
} from "typeorm";
import { customerServices } from "./customerService";
import { PgDataSource } from "../../config/data-source";
import { Customer } from "../../entity/crm/customer";

class QuoteService {
  appid = "6191e49fc6c18500070f60ca";
  entryid = "60458a1dc5f30c000902e2b9";
  trigger = async (appid, entryid, op, data) => {
    if (appid != this.appid || entryid != this.entryid) return;
    const quote = this.mapping(data);
    await customerServices.setCollaborator(
      quote.customerId,
      quote.projectManagerId
    );
    const flow = await this.getFlow(data._id);
    if (flow) {
      quote.flowState = flow.flowState;
      quote.currentApprovalNode = flow.currentApprovalNode;
      quote.currentApprover = flow.currentApprover ?? "";
      quote.docCreatorId = flow.docCreatorId ?? "";
    }
    if (op === "data_create") {
      quote.items.forEach((item) => {
        item.quote = quote;
      });
      const saved = await Quote.save(quote);
      await jdyFormDataApiClient.singleDataUpdate(
        this.appid,
        this.entryid,
        data._id,
        {
          _widget_1750573099706: JdyUtil.setText(
            `http://hz.jc-times.com:2006/quote/${saved.id}`
          ),
        }
      );
    } else if (op === "data_update") {
      await this.updatePriceOnly(quote);
    } else {
      await this.bulkSaveQuotes([quote]);
    }
  };
  mapping = (data) => {
    const quote = Quote.create({
      quoteId: data["_widget_1615190928573"],
      quoteNumber: data["_widget_1615191306812"],
      type: "oa",
      status: "draft",
      jdyId: data["_id"],
      flowState: JdyUtil.getState(data["flowState"]),
      opportunityId: data["_widget_1631004165106"]?.["id"],
      opportunityName: data["_widget_1631005820116"],
      currencyType: data["_widget_1747554783067"],
      customerName: data["_widget_1615858669714"],
      customerId: data["_widget_1615858669716"],
      creatorId: JdyUtil.getUser(data["creator"])?.username,
      chargerId: JdyUtil.getUser(data["_widget_1631004899715"])?.username,
      salesSupportId: JdyUtil.getUser(data["_widget_1747210042058"])?.username,
      projectManagerId: JdyUtil.getUsers(data["_widget_1744100160201"])?.[0]
        ?.username,
      totalProductPrice: data["_widget_1615187419548"],
      discountAmount: data["_widget_1615187419925"],
      quoteAmount: data["_widget_1615187419587"],
      deliveryDays: Math.floor(data["_widget_1746424952024"]),
      address: JdyUtil.getAddress(data["_widget_1747554783125"]),
      contactName: data["_widget_1746269552377"],
      contactPhone: data["_widget_1746269552378"],
      technicalLevel: data["_widget_1744875560210"],
      material: data["_widget_1747554783187"],
      finalProduct: data["_widget_1747554783172"].join(","),
      applicationField: data["_widget_1747554783170"].join(","),
    });
    if (data["_widget_1615187419450"])
      quote.quoteTime = JdyUtil.getDate(data["_widget_1615187419450"]);
    quote.items = data["_widget_1615187420300"].map((item, index) => {
      return QuoteItem.create({
        index: index + 1,
        jdyId: item["_id"],
        productCategory: [
          item["_widget_1743122083863"],
          item["_widget_1743122083868"],
          item["_widget_1743122083870"],
        ].filter((v) => v),
        productName: item["_widget_1615858670970"],
        config: { remark: item["_widget_1743122083872"] },
        quantity: item["_widget_1615187421349"],
        unitPrice: item["_widget_1615858670973"],
        guidePrice: item["_widget_1744502974161"],
        discountRate: (item["_widget_1615187421408"] ?? 0) * 100,
        subtotal: item["_widget_1615187421495"],
        unit: item["_widget_1615858670974"],
        brand: item["_widget_1747559943553"],
      });
    });
    // ["a"].map((value, index) => []);
    return quote;
  };
  getFlow = async (id) => {
    if (!id) return null;
    const flow = await workflowApiClient.workflowInstanceGet(id);
    const currentNode = flow.tasks.find((task) => task.status == 0);
    const docNode = flow.tasks.find((task) => task.flow_name == "报价单节点");
    return {
      flowState: JdyUtil.getState(flow.status),
      currentApprovalNode: flow.status == 1 ? "" : currentNode?.flow_name,
      currentApprover:
        flow.status == 1
          ? ""
          : JdyUtil.getUser(currentNode?.assignee)?.username,
      docCreatorId: JdyUtil.getUser(docNode?.assignee)?.username,
    };
  };
  findJdy = async () => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      {
        filter: {
          rel: "and",
          cond: [
            {
              field: "_widget_1750573099706",
              method: "empty",
            },
          ],
        },
        limit: 100,
      }
    );
    return result;
  };

  addAlltoDb = async () => {
    const data = await this.findJdy();
    const c: any[] = [];
    for (const item of data) {
      const cus = this.mapping(item);
      c.push(cus);
    }
    const chunks = _.chunk(c, 100);
    for (const chunk of chunks) {
      await this.bulkSaveQuotes(chunk);
      // const result = await Quote.upsert(chunk, {
      //   conflictPaths: ["jdyId"],
      // });
    }
  };

  addAllFlow = async () => {
    const quotes = await Quote.find();
    for (const quote of quotes) {
      const flow = await this.getFlow(quote.jdyId);
      if (flow) {
        quote.flowState = flow.flowState;
        quote.currentApprovalNode = flow.currentApprovalNode;
        quote.currentApprover = flow.currentApprover ?? "";
        quote.docCreatorId = flow.docCreatorId ?? "";
        await quote.save();
      }
    }
  };

  bulkSaveQuotes = async (quoteList: Quote[]) => {
    const quoteIds = quoteList.map((quote) => quote.jdyId);

    // Fetch existing quotes with their items
    const existingQuotes = await Quote.find({
      where: { jdyId: In(quoteIds) },
      relations: ["items"],
    });

    const newQuotes: Quote[] = [];

    // Update existing quotes and collect new ones
    quoteList.forEach((incoming) => {
      const exist = existingQuotes.find((q) => q.jdyId === incoming.jdyId);
      if (exist) {
        // Update quote properties
        const { id, items, ...other } = incoming;
        Object.assign(exist, other);

        // Update existing items
        exist.items.forEach((item) => {
          const findItem = incoming.items.find((q) => q.jdyId == item.jdyId);
          if (findItem) {
            item.config["remark"] = findItem.config?.["remark"];
            const { id, config, ...other } = findItem;
            Object.assign(item, other);
          }
        });

        // Add new items that don't exist
        const additionalItems = incoming.items.filter(
          (findItem) =>
            !exist.items.some(
              (existingItem) => existingItem.jdyId === findItem.jdyId
            )
        );
        additionalItems.forEach((i) => (i.quote = exist));
        exist.items.push(...additionalItems);
      } else {
        // New quote
        incoming.items.forEach((i) => (i.quote = incoming));
        newQuotes.push(incoming);
      }
    });

    // You'll probably want to save the quotes here
    await Quote.save([...existingQuotes, ...newQuotes]);
  };

  updatePriceOnly = async (quote: Quote) => {
    const existing = await Quote.findOne({
      where: { jdyId: quote.jdyId },
      relations: ["items"],
    });
    if (!existing) return;
    existing.totalProductPrice = quote.totalProductPrice;
    existing.discountAmount = quote.discountAmount;
    existing.quoteAmount = quote.quoteAmount;
    existing.items.forEach((item) => {
      const updated = quote.items.find((i) => i.jdyId === item.jdyId);
      if (updated) {
        item.quantity = updated.quantity;
        item.unitPrice = updated.unitPrice;
        item.guidePrice = updated.guidePrice;
        item.discountRate = updated.discountRate;
        item.subtotal = updated.subtotal;
      }
    });
    await existing.save();
  };

  quoteToJdyData = (quote: Quote) => {
    const result = {
      _widget_1615187419548: JdyUtil.setNumber(quote.totalProductPrice),
      _widget_1615187419925: JdyUtil.setNumber(quote.discountAmount),
      _widget_1615187419587: JdyUtil.setNumber(quote.quoteAmount),
      _widget_1746424952024: JdyUtil.setNumber(quote.deliveryDays),
      _widget_1747554783125: JdyUtil.setAddress(quote.address),
      _widget_1746269552377: JdyUtil.setText(quote.contactName),
      _widget_1746269552378: JdyUtil.setText(quote.contactPhone),
      _widget_1744875560210: JdyUtil.setText(quote.technicalLevel),
      _widget_1747554783187: JdyUtil.setCombos(quote.material),
      _widget_1747554783172: JdyUtil.setCombos([quote.finalProduct]),
      _widget_1747554783170: JdyUtil.setCombos([quote.applicationField]),
      _widget_1615187419450: JdyUtil.setDate(quote.quoteTime),
      _widget_1615187420300: JdyUtil.setSubForm(
        quote.items.map((item) => ({
          _id: JdyUtil.setText(item.jdyId),
          _widget_1743122083863: JdyUtil.setText(item.productCategory?.[0]),
          _widget_1743122083868: JdyUtil.setText(item.productCategory?.[1]),
          _widget_1743122083870: JdyUtil.setText(item.productCategory?.[2]),
          _widget_1615858670970: JdyUtil.setText(item.productName),
          _widget_1743122083872: JdyUtil.setText(item.config?.remark),
          _widget_1615187421349: JdyUtil.setNumber(item.quantity),
          _widget_1615858670973: JdyUtil.setNumber(item.unitPrice),
          _widget_1744502974161: JdyUtil.setNumber(item.guidePrice),
          _widget_1615187421408: JdyUtil.setNumber(item.discountRate / 100),
          _widget_1615187421495: JdyUtil.setNumber(item.subtotal),
          _widget_1615858670974: JdyUtil.setText(item.unit),
          _widget_1747559943553: JdyUtil.setText(item.brand),
        }))
      ),
      _widget_1750573099706: JdyUtil.setText(
        `http://hz.jc-times.com:2006/quote/${quote.id}`
      ),
    };
    return result;
  };

  updateJdyFromQuote = async (quote: Quote) => {
    await jdyFormDataApiClient.singleDataUpdate(
      this.appid,
      this.entryid,
      quote.jdyId,
      this.quoteToJdyData(quote)
    );
  };

  updateAllQuoteLinks = async () => {
    const quotes = await Quote.find({
      where: {
        jdyId: Not(IsNull()),
        quoteTime: MoreThan(new Date("2025/06/01")),
      },
      order: { quoteTime: "DESC" },
    });
    for (const quote of quotes) {
      await jdyFormDataApiClient.singleDataUpdate(
        this.appid,
        this.entryid,
        quote.jdyId,
        {
          _widget_1750573099706: JdyUtil.setText(
            `http://hz.jc-times.com:2006/quote/${quote.id}`
          ),
        }
      );
    }
  };

  createQuote = async (
    params: {
      customerName: string;
      customerId: string;
      quoteId: string;
      orderId?: string;
      date: string;
    },
    creatorId: string
  ) => {
    if (params.orderId) {
      const exist = await Quote.findOne({ where: { orderId: params.orderId } });
      if (exist) return { message: "订单号重复" } as any;
    }
    return await Quote.create({
      ...params,
      currencyType: "CNY",
      quoteNumber: 1,
      quoteTime: new Date(params.date),
      creatorId,
      contractTerms: [],
      quoteTerms: [],
    }).save();
  };

  updateQuote = async (quote: Quote) => {
    const saved = await Quote.save(quote);
    if (quote.jdyId && quote.status == "complete") {
      await this.updateJdyFromQuote(saved);
    }
    return saved;
  };

  createQuoteItem = async (
    quoteId: number,
    parentId: number | null,
    params: Partial<QuoteItem>
  ) => {
    if (!quoteId) return;
    const quoteItem = QuoteItem.create({
      ...params,
      discountRate: 100,
      quantity: 1,
      unitPrice: undefined,
      quote: { id: quoteId },
    });
    // if (parentId) {
    //   const parent = await QuoteItem.findOne({ where: { id: parentId } });
    //   if (parent) quoteItem.parent = parent;
    // }
    return await quoteItem.save();
  };

  removeQuoteItem = async (quoteItemId) => {
    return await QuoteItem.delete(quoteItemId);
  };

  getQuotes = async (
    params?: {
      page?: number;
      pageSize?: number;
      type?: string;
      quoteName?: string;
      customerName?: string;
      sort?: string;
      status?: string;
      approvalNode?: string;
      currentApprover?: string;
    },
    userid?: string
  ) => {
    const {
      page = 1,
      pageSize = 20,
      type,
      quoteName,
      customerName,
      sort,
      status,
      approvalNode,
      currentApprover,
    } = params || {};

    const query = Quote.createQueryBuilder("quote").leftJoin(
      Customer,
      "customer",
      "customer.erpId = quote.customerId"
    );
    if (type) {
      query.andWhere("quote.type = :type", { type });
    }
    if (quoteName) {
      query.andWhere("quote.quoteName LIKE :quoteName", {
        quoteName: `%${quoteName}%`,
      });
    }
    if (status) {
      query.andWhere("quote.status LIKE :status", {
        status: `%${status}%`,
      });
    }
    if (approvalNode) {
      query.andWhere("quote.approvalNode LIKE :approvalNode", {
        approvalNode: `%${approvalNode}%`,
      });
    }
    if (currentApprover) {
      query.andWhere("quote.currentApprover LIKE :currentApprover", {
        currentApprover: `%${currentApprover}%`,
      });
    }
    if (customerName) {
      query.andWhere("quote.customerName LIKE :customerName", {
        customerName: `%${customerName}%`,
      });
    }
    if (type === "oa") {
      query.andWhere((qb) => {
        const sub = qb
          .subQuery()
          .select("MAX(q2.quoteNumber)")
          .from(Quote, "q2")
          .where("q2.opportunityId = quote.opportunityId")
          .andWhere("q2.type = :type", { type })
          .getQuery();
        return `quote.quoteNumber = ${sub}`;
      });
    }
    if (userid && userid !== "LiangZhi" && userid !== "LiaoGengCong") {
      query.andWhere(
        new Brackets((qb) => {
          qb.where("quote.creatorId = :userid", { userid })
            .orWhere("quote.chargerId = :userid", { userid })
            .orWhere("quote.projectManagerId = :userid", { userid })
            .orWhere("quote.salesSupportId = :userid", { userid })
            .orWhere("customer.chargerId = :userid", { userid })
            .orWhere("customer.supporterId = :userid", { userid })
            .orWhere("customer.collaboratorId LIKE :search", {
              search: `%${userid}%`,
            });
        })
      );
    }

    if (sort) {
      const sorts = sort.split(",").filter((v) => v);
      sorts.forEach((rule, idx) => {
        const [field, order] = rule.split(":");
        if (field) {
          const direction =
            order && order.toUpperCase() === "DESCEND" ? "DESC" : "ASC";
          if (idx === 0) {
            query.orderBy(`quote.${field}`, direction as any);
          } else {
            query.addOrderBy(`quote.${field}`, direction as any);
          }
        }
      });
    }

    const [list, total] = await query
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { list, total };
  };

  getQuoteDetail = async (quoteId: number, userid?: string) => {
    if (!quoteId) return;
    const query = Quote.createQueryBuilder("quote")
      .leftJoinAndSelect("quote.items", "item")
      .leftJoin(Customer, "customer", "customer.erpId = quote.customerId")
      .where("quote.id = :quoteId", { quoteId })
      .orderBy("item.index", "ASC");
    if (userid && userid !== "LiangZhi" && userid !== "LiaoGengCong") {
      query.andWhere(
        new Brackets((qb) => {
          qb.where("quote.creatorId = :userid", { userid })
            .orWhere("quote.chargerId = :userid", { userid })
            .orWhere("quote.projectManagerId = :userid", { userid })
            .orWhere("quote.salesSupportId = :userid", { userid })
            .orWhere("customer.chargerId = :userid", { userid })
            .orWhere("customer.supporterId = :userid", { userid })
            .orWhere("customer.collaboratorId LIKE :search", {
              search: `%${userid}%`,
            });
        })
      );
    }
    const quote = await query.getOne();

    return quote;
  };
}

export const quoteService = new QuoteService();
