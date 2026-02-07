import { Request, Response } from "express";
import { customerServices } from "../../../services/crm/customerService";
import { contactService } from "../../../services/crm/contactService";
import { authService } from "../../../services/authService";
import { opportunityServices } from "../../../services/crm/opportunityService";
import { productService } from "../../../services/crm/productService";
import { quoteService } from "../../../services/crm/quoteService";
import { getLocalFilePath } from "../../../utils/fileUtils";
import { Quote } from "../../../entity/crm/quote";
const test = async (request: Request, response: Response) => {
  const quotes = await Quote.find({
    where: { type: "history" },
    relations: ["items"],
  });
  response.send(quotes);
};

const getQuotes = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const quotes = await quoteService.getQuotes(
    {
      ...request.query,
      page: parseInt(request.query.page as string),
      pageSize: parseInt(request.query.pageSize as string),
      type: request.query.type as string,
      quoteName: request.query.quoteName as string,
      customerName: request.query.customerName as string,
      sort: request.query.sort as string,
    },
    userid
  );
  response.send(quotes);
};

const updateQuote = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const { quote, submit } = request.body;
  const result = await quoteService.updateQuote(quote, submit);
  response.send(result);
};

const getQuoteDetail = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const quoteId = request.query.quoteId as string;
  const quotes = await quoteService.getQuoteDetail(parseInt(quoteId), userid);
  response.send(quotes);
};

const createQuote = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const params = request.body;
  const quote = await quoteService.createQuote(params, userid);
  response.send(quote);
};

const createQuoteItem = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const { quoteId, parentId, params } = request.body;
  const quote = await quoteService.createQuoteItem(quoteId, parentId, params);
  response.send(quote);
};

const deleteQuoteItem = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const quoteItemId = request.query.quoteItemId;
  const quote = await quoteService.removeQuoteItem(quoteItemId);
  response.send(quote);
};

const executeContract = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const { quoteId } = request.body;
  if (!quoteId) {
    response.status(400).send("Missing quoteId");
    return;
  }
  const result = await quoteService.printQuote(quoteId);
  response.send(result);
};

const sendPrintFile = (key: "config" | "quotation" | "contract") => {
  return async (request: Request, response: Response) => {
    const userid = (await authService.verifyToken(request))?.userId;
    if (!userid) {
      response.status(401).send("Unauthorized");
      return;
    }
    const id = parseInt(request.query.id as string);
    if (!id) {
      response.status(400).send("Missing id");
      return;
    }

    // 权限检测
    const permit = await quoteService.getQuoteDetail(id, userid);
    if (!permit) {
      response.status(403).send("Forbidden");
      return;
    }
    // 判断是否需要重新打印
    const quote = await quoteService.printQuote(id);

    if (!quote) {
      response.status(404).send("Not Found");
      return;
    }
    const file =
      key === "config"
        ? quote.files?.configPdf
        : key === "quotation"
        ? quote.files?.quotationPdf
        : quote.files?.contractPdf;
    if (!file) {
      response.status(404).send("Not Found");
      return;
    }
    response.sendFile(getLocalFilePath(file));
  };
};

export const QuoteRoutes = [
  {
    path: "/quote/create",
    method: "post",
    action: createQuote,
  },
  {
    path: "/quote/update",
    method: "post",
    action: updateQuote,
  },
  {
    path: "/quoteItem/create",
    method: "post",
    action: createQuoteItem,
  },
  {
    path: "/quoteItem/delete",
    method: "delete",
    action: deleteQuoteItem,
  },
  {
    path: "/quote/fillItemProduct",
    method: "post",
    action: async (request: Request, response: Response) => {
      const userid = (await authService.verifyToken(request))?.userId;
      if (!userid) {
        response.status(401).send("Unauthorized");
        return;
      }
      await quoteService.fillItemsFromOrders();
      response.send("ok");
    },
  },
  {
    path: "/category/get",
    method: "get",
    action: async (request: Request, response: Response) => {
      const category = await productService.getCategory();
      response.send(category);
    },
  },
  {
    path: "/quote/get",
    method: "get",
    action: getQuotes,
  },
  {
    path: "/quote/detail/get",
    method: "get",
    action: getQuoteDetail,
  },
  {
    path: "/contract/execute",
    method: "post",
    action: executeContract,
  },
  {
    path: "/quote/config/print",
    method: "get",
    action: sendPrintFile("config"),
  },
  {
    path: "/quote/quotation/print",
    method: "get",
    action: sendPrintFile("quotation"),
  },
  {
    path: "/quote/contract/print",
    method: "get",
    action: sendPrintFile("contract"),
  },
  {
    path: "/quote/test",
    method: "get",
    action: test,
  },
];
