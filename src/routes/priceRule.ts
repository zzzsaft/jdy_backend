import { Request, Response } from "express";
import { priceRuleService } from "../services/crm/priceRuleService";
import { authService } from "../services/authService";

const getRules = async (_req: Request, res: Response) => {
  const rules = await priceRuleService.getRules();
  res.send(rules);
};

const createRule = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const { rule } = req.body;
  const result = await priceRuleService.createRule(rule);
  res.send(result);
};

const updateRule = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const { ruleId, rule } = req.body;
  const result = await priceRuleService.updateRule(ruleId, rule);
  res.send(result);
};

const deleteRule = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const ruleId = req.query.ruleId as string;
  const result = await priceRuleService.deleteRule(ruleId);
  res.send(result);
};

export const PriceRuleRoutes = [
  { path: "/priceRule/get", method: "get", action: getRules },
  { path: "/priceRule/create", method: "post", action: createRule },
  { path: "/priceRule/update", method: "post", action: updateRule },
  { path: "/priceRule/delete", method: "delete", action: deleteRule },
];
