import { Request, Response } from "express";
import { productService } from "../../../services/crm/productService.js";
import { partService } from "../../../services/crm/partService.js";
import { authService } from "../../../services/authService.js";

const searchProducts = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const keyword = (request.query.keyword as string) ?? "";
  const field = (request.query.field as "code" | "name") ?? "name";
  const formType = (request.query.formType as string) ?? "";
  const page = parseInt(request.query.page as string) || 1;
  const pageSize = parseInt(request.query.pageSize as string) || 10;
  const result = await productService.searchProducts(
    keyword,
    field,
    formType,
    page,
    pageSize
  );
  response.send(result);
};

const searchParts = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const keyword = (request.query.keyword as string) ?? "";
  const result = await partService.searchParts(keyword);
  response.send(result);
};

export const ProductRoutes = [
  {
    path: "/product/search",
    method: "get",
    action: searchProducts,
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
    path: "/product/pump/get",
    method: "get",
    action: async (request: Request, response: Response) => {
      const userid = (await authService.verifyToken(request))?.userId;
      if (!userid) {
        response.status(401).send("Unauthorized");
        return;
      }
      const model =
        (request.query.model as string) ??
        (request.query.keyword as string) ??
        (request.query.q as string) ??
        "";
      const category = await productService.getPump({
        model,
        exact: request.query.exact === "true",
      });
      response.send(category);
    },
  },
  {
    path: "/product/filter/get",
    method: "get",
    action: async (request: Request, response: Response) => {
      const userid = (await authService.verifyToken(request))?.userId;
      if (!userid) {
        response.status(401).send("Unauthorized");
        return;
      }
      const model =
        (request.query.model as string) ??
        (request.query.keyword as string) ??
        (request.query.q as string) ??
        "";
      const data = await productService.getFilter({
        model,
        exact: request.query.exact === "true",
      });
      response.send(data);
    },
  },
  {
    path: "/product/part/search",
    method: "get",
    action: searchParts,
  },
];
