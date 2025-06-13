import { Request, Response } from "express";
import { authService } from "../services/authService";
import { opportunityServices } from "../services/crm/opportunityService";
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
];
