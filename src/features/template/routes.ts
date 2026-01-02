import { Request, Response } from "express";
import { templateService } from "../../services/crm/templateService";
import { authService } from "../../services/authService";

const getTemplates = async (req: Request, res: Response) => {
  const templates = await templateService.getTemplates({
    formType: req.query.formType as string,
    page: parseInt(req.query.page as string),
    pageSize: parseInt(req.query.pageSize as string),
  });
  res.send(templates);
};

const getTemplate = async (req: Request, res: Response) => {
  const id = req.query.id as string;
  const template = await templateService.getTemplate(id);
  res.send(template);
};

const createTemplate = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const result = await templateService.createTemplate(req.body, userid);
  res.send(result);
};

const updateTemplate = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const { id, ...data } = req.body;
  const result = await templateService.updateTemplate(id, data);
  res.send(result);
};

const deleteTemplate = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const id = req.query.id as string;
  const result = await templateService.deleteTemplate(id);
  res.send(result);
};

export const TemplateRoutes = [
  { path: "/template/get", method: "get", action: getTemplates },
  { path: "/template/detail/get", method: "get", action: getTemplate },
  { path: "/template/create", method: "post", action: createTemplate },
  { path: "/template/update", method: "post", action: updateTemplate },
  { path: "/template/delete", method: "delete", action: deleteTemplate },
];
