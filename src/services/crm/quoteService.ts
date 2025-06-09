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
import { getManager, In, IsNull } from "typeorm";
import { customerServices } from "./customerService";
import { PgDataSource } from "../../config/data-source";

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
    await this.bulkSaveQuotes([quote]);
  };
  mapping = (data) => {
    const quote = Quote.create({
      quoteId: data["_widget_1615190928573"],
      quoteNumber: data["_widget_1615191306812"],
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
      finalProduct: data["_widget_1747554783172"],
      applicationField: data["_widget_1747554783170"],
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
        children: [],
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

  // bulkSaveQuotes = async (quoteList: Quote[]) => {
  //   const quoteIds = quoteList.map((quote) => quote.jdyId);
  //   const quoteItemIds = quoteList
  //     .flatMap((quote) => quote.items)
  //     .map((item) => item.jdyId);
  //   const quotes = await Quote.find({
  //     where: { jdyId: In(quoteIds) },
  //     relations: ["items"],
  //   });

  //   const quoteIdMap = new Map<string, number>();
  //   const quoteItemIdMap = new Map<string, number>();
  //   quotes.forEach((quote) => {
  //     const findQuote = quoteList.find(q=>q.jdyId == quote.jdyId)
  //     if (findQuote){
  //       const {id, items,...other} = findQuote
  //       Object.assign(quote,other)
  //       quote.items.forEach(item=>{
  //     const finditem = findQuote.items.find(q=>q.jdyId == item.jdyId)
  //     if (finditem){
  //       item.config['remark'] = finditem.config?.['remark']
  //       const {id, config,...other} = finditem
  //       Object.assign(item,other)
  //     }
  //       })
  //       quote.items.concat(findQuote.items.filter())
  //     }
  //     // quoteIdMap.set(quote.jdyId, quote.id);
  //     // quote.items.forEach((quote) => {
  //     //   quoteItemIdMap.set(quote.jdyId, quote.id);
  //     // });
  //   });

  //   quoteList.forEach((quote) => {
  //     quote.id = (quoteIdMap.get(quote.jdyId) ?? undefined) as number;
  //     if (quote.id){

  //     }
  //     quote.items.forEach((item) => {
  //       item.id = (quoteItemIdMap.get(item.jdyId) ?? undefined) as number;
  //     });
  //   });
  //   await Quote.save(quoteList);
  // };

  bulkSaveQuotes = async (quoteList: Quote[]) => {
    const quoteIds = quoteList.map((quote) => quote.jdyId);
    const quoteItemIds = quoteList
      .flatMap((quote) => quote.items)
      .map((item) => item.jdyId);

    // Fetch existing quotes with their items
    const quotes = await Quote.find({
      where: { jdyId: In(quoteIds) },
      relations: ["items"],
    });

    quotes.forEach((quote) => {
      const findQuote = quoteList.find((q) => q.jdyId == quote.jdyId);
      if (findQuote) {
        // Update quote properties
        const { id, items, ...other } = findQuote;
        Object.assign(quote, other);

        // Update existing items
        quote.items.forEach((item) => {
          const findItem = findQuote.items.find((q) => q.jdyId == item.jdyId);
          if (findItem) {
            item.config["remark"] = findItem.config?.["remark"];
            const { id, config, ...other } = findItem;
            Object.assign(item, other);
          }
        });

        // Add new items that don't exist in quote.items
        const newItems = findQuote.items.filter(
          (findItem) =>
            !quote.items.some(
              (existingItem) => existingItem.jdyId === findItem.jdyId
            )
        );
        quote.items.push(...newItems);
      }
    });

    // You'll probably want to save the quotes here
    await Quote.save(quotes);
  };

  createQuote = async (
    params: {
      customerName: string;
      customerId: string;
      quoteId: string;
      date: string;
    },
    creatorId: string
  ) => {
    return await Quote.create({
      ...params,
      currencyType: "CNY",
      quoteNumber: 1,
      quoteTime: new Date(params.date),
      creatorId,
    }).save();
  };

  updateQuote = async (quote: Quote) => {
    return await Quote.save(quote);
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
    if (parentId) {
      const parent = await QuoteItem.findOne({ where: { id: parentId } });
      if (parent) quoteItem.parent = parent;
    }
    return await quoteItem.save();
  };

  removeQuoteItem = async (quoteItemId) => {
    return await QuoteItem.delete(quoteItemId);
  };

  getQuotes = async () => {
    return await Quote.find({ where: { type: "history" } });
  };
  getQuoteDetail = async (quoteId: number) => {
    const itemTreeRepository = PgDataSource.getTreeRepository(QuoteItem);
    const quote = await Quote.findOne({
      where: { id: quoteId },
      // relations: ["items"],
    });
    if (quote) {
      // 直接查询属于这个 quote 的所有 items 并构建树
      const roots = await itemTreeRepository.find({
        where: { quote: { id: quoteId }, parentId: IsNull() },
      });
      quote.items = await Promise.all(
        roots.map((root) => itemTreeRepository.findDescendantsTree(root))
      );
    }

    return quote;
  };
}

export const quoteService = new QuoteService();
