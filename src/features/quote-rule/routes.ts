import { Request, Response } from "express";
import { quoteRuleService } from "../../services/crm/quoteRuleService";
import { authService } from "../../services/authService";

const getRules = async (_req: Request, res: Response) => {
  const rules = await quoteRuleService.getRules();
  res.send(rules);
};

const createRule = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const { rule } = req.body;
  const result = await quoteRuleService.createRule(rule);
  res.send(result);
};

const updateRule = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const { ruleId, rule } = req.body;
  const result = await quoteRuleService.updateRule(ruleId, rule);
  res.send(result);
};

const deleteRule = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const ruleId = req.query.ruleId as string;
  const result = await quoteRuleService.deleteRule(ruleId);
  res.send(result);
};

export const QuoteRuleRoutes = [
  { path: "/quoteRule/get", method: "get", action: getRules },
  { path: "/quoteRule/create", method: "post", action: createRule },
  { path: "/quoteRule/update", method: "post", action: updateRule },
  { path: "/quoteRule/delete", method: "delete", action: deleteRule },
];
