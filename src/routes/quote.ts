import { Request, Response } from "express";
import { customerServices } from "../services/crm/customerService";
import { contactService } from "../services/crm/contactService";
import { authService } from "../services/authService";
import { opportunityServices } from "../services/crm/opportunityService";
import { productService } from "../services/crm/productService";
import { quoteService } from "../services/crm/quoteService";
const getQuotes = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const quotes = await quoteService.getQuotes(
    {
      page: parseInt(request.query.page as string),
      pageSize: parseInt(request.query.pageSize as string),
      type: request.query.type as string,
      quoteName: request.query.quoteName as string,
      customerName: request.query.customerName as string,
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
  const { quote } = request.body;
  const result = await quoteService.updateQuote(quote);
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
];
