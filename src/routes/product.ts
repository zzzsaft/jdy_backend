import { Request, Response } from "express";
import { productService } from "../services/crm/productService";
import { authService } from "../services/authService";

const searchProducts = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const keyword = (request.query.keyword as string) ?? "";
  const field = (request.query.field as "code" | "name") ?? "name";
  const formType = (request.query.formType as string) ?? "";
  const result = await productService.searchProducts(keyword, field, formType);
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
      const category = await productService.getPump();
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
      const data = await productService.getFilter();
      response.send(data);
    },
  },
];
