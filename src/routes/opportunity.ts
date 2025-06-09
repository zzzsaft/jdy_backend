import { Request, Response } from "express";
import { customerServices } from "../services/crm/customerService";
import { contactService } from "../services/crm/contactService";
import { authService } from "../services/authService";
import { opportunityServices } from "../services/crm/opportunityService";
import { productService } from "../services/crm/productService";
const getOpportunity = async (request: Request, response: Response) => {
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) {
    response.status(401).send("Unauthorized");
    return;
  }
  const company = request.query.company as string[];
  const status = request.query.status as string[];
  const opportunities = await opportunityServices.getOpportunity(
    userid,
    company,
    status
  );
  response.send(opportunities);
};
export const OpportunityRoutes = [
  {
    path: "/opportunity/get",
    method: "get",
    action: getOpportunity,
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
