import { Request, Response } from "express";
import { customerServices } from "../services/crm/customerService";
import { contactService } from "../services/crm/contactService";
import { authService } from "../services/authService";
const searchCustomer = async (request: Request, response: Response) => {
  const name = request.query.keyword as string;
  const company = await customerServices.findCompany(name);
  response.send(company);
};
const matchCustomer = async (request: Request, response: Response) => {
  const body = request.body;
  const userid = (await authService.verifyToken(request)).userId;
  await contactService.matchCompanyContacts({
    externalUserId: body.externalUserId,
    corpName: body.corpName,
    jdyId: body.jdyId,
    userid,
    name: body.name,
    position: body.position,
    remark: body.remark,
    mobile: [body.mobile],
    isKeyDecisionMaker: body.isKeyDecisionMaker,
    updateQywxRemark: body.updateQywxRemark,
  });
  const link = authService.jdySSO(
    userid,
    `https://www.jiandaoyun.com/dashboard/app/6191e49fc6c18500070f60ca/form/020100200000000000000001/data/${body.jdyId}/qr_link`
  );
  const link1 = `https://www.jiandaoyun.com/dashboard/app/6191e49fc6c18500070f60ca/form/020100200000000000000001/data/${body.jdyId}/qr_link`;
  response.send({ link: link1 });
};

const getExternalUserInfo = async (request: Request, response: Response) => {
  const externalUserId = request.query.id as string;
  const userid = (await authService.verifyToken(request)).userId;
  if (!userid) return response.status(401).send("Unauthorized");
  const data = await contactService.getExternalUserInfo(externalUserId, userid);
  response.send(data);
};
const getJdyId = async (request: Request, response: Response) => {
  const externalUserId = request.query.id as string;
  const id = await contactService.getJdyIdByExternalUserId(externalUserId);
  const userid = (await authService.verifyToken(request)).userId;
  if (id && userid) {
    const link = authService.jdySSO(
      userid,
      `https://www.jiandaoyun.com/dashboard/app/6191e49fc6c18500070f60ca/form/020100200000000000000001/data/${id}/qr_link`
    );
    // console.log(id, link);
    response.send({
      link: `https://www.jiandaoyun.com/dashboard/app/6191e49fc6c18500070f60ca/form/020100200000000000000001/data/${id}/qr_link`,
    });
    return;
  }
  response.send({
    link: null,
  });
};

const getContact = async (request: Request, response: Response) => {
  const companyid = request.query.id as string;
  if (!companyid) return response.status(400).send("参数错误");
  const userid = (await authService.verifyToken(request))?.userId;
  if (!userid) return response.status(401).send("Unauthorized");
  const data = await contactService.getContactbyCompany(companyid);
  return response.send(data);
};
export const CustomerRoutes = [
  {
    path: "/customer/search",
    method: "get",
    action: searchCustomer,
  },
  {
    path: "/customer/match",
    method: "post",
    action: matchCustomer,
  },
  {
    path: "/customer/get",
    method: "get",
    action: getExternalUserInfo,
  },
  {
    path: "/customer/jdy/get",
    method: "get",
    action: getJdyId,
  },
  {
    path: "/customer/contact/get",
    method: "get",
    action: getContact,
  },
];
