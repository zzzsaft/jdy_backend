import { Request, Response } from "express";
import { ruleService } from "../../services/crm/ruleService";
import { authService } from "../../services/authService";

const getRules = async (req: Request, res: Response) => {
  const type = req.query.type as "price" | "grade" | "delivery";
  const rules = await ruleService.getRules(type);
  res.send(rules);
};

const createRule = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const { rule } = req.body;
  const result = await ruleService.createRule(rule);
  res.send(result);
};

const updateRule = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const { ruleId, rule } = req.body;
  const result = await ruleService.updateRule(ruleId, rule);
  res.send(result);
};

const deleteRule = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const ruleId = req.query.ruleId as string;
  const result = await ruleService.deleteRule(ruleId);
  res.send(result);
};

export const RuleRoutes = [
  { path: "/rules/get", method: "get", action: getRules },
  { path: "/rules/create", method: "post", action: createRule },
  { path: "/rules/update", method: "post", action: updateRule },
  { path: "/rules/delete", method: "delete", action: deleteRule },
];
