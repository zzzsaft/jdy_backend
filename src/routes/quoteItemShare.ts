import { Request, Response } from "express";
import { authService } from "../services/authService";
import { quoteItemShareService } from "../services/crm/quoteItemShareService";
import { User } from "../entity/basic/employee";

const createShare = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const { quoteItemId, expiresAt, editable } = req.body;
  const { uuid, pwd } = await quoteItemShareService.createShareLink(
    Number(quoteItemId),
    userid,
    new Date(expiresAt),
    editable
  );
  res.send({ uuid, pwd });
};

const getLinks = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const quoteItemId = Number(req.query.quoteItemId as string);
  const data = await quoteItemShareService.getShareLinks(quoteItemId, userid);
  res.send(data);
};

const getShare = async (req: Request, res: Response) => {
  const uuid = req.query.uuid as string;
  const pwd = req.query.pwd as string;
  const data = await quoteItemShareService.getShare(uuid, pwd);
  if (!data) return res.status(404).send("Not Found");
  const user = await User.findOne({ where: { user_id: data.shareUserId } });
  if (!('quoteItem' in data)) {
    return res.status(410).send({
      expiredAt: (data as any).expiredAt,
      shareUserName: user?.name,
    });
  }
  res.send({
    quoteItem: (data as any).quoteItem,
    quoteId: (data as any).quoteId,
    editable: (data as any).editable,
    shareUserName: user?.name,
  });
};

const disableShare = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const { quoteItemId } = req.body;
  await quoteItemShareService.disableShare(Number(quoteItemId), userid);
  res.send("ok");
};

const updateExpire = async (req: Request, res: Response) => {
  const userid = (await authService.verifyToken(req))?.userId;
  if (!userid) return res.status(401).send("Unauthorized");
  const { uuid, expiresAt } = req.body;
  const result = await quoteItemShareService.updateExpire(
    uuid,
    userid,
    new Date(expiresAt)
  );
  if (!result) return res.status(404).send("Not Found");
  res.send("ok");
};

const saveShare = async (req: Request, res: Response) => {
  const { uuid, shareUserId, quoteItem } = req.body;
  const result = await quoteItemShareService.saveShare(uuid, shareUserId, quoteItem);
  if (!result) return res.status(400).send("Invalid uuid or user");
  res.send(result);
};

export const QuoteItemShareRoutes = [
  { path: "/quoteItem/share", method: "post", action: createShare },
  { path: "/quoteItem/share", method: "get", action: getLinks },
  { path: "/quoteItem/share/detail", method: "get", action: getShare },
  { path: "/quoteItem/share/disable", method: "post", action: disableShare },
  { path: "/quoteItem/share/expire", method: "post", action: updateExpire },
  { path: "/quoteItem/share/save", method: "post", action: saveShare },
];
